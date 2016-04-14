﻿using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using TweetDick.Core.Other;
using TweetDick.Migration.Helpers;

namespace TweetDick.Migration{
    static class MigrationManager{
        private static readonly string TweetDeckPathParent = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"twitter");
        private static readonly string TweetDeckPath = Path.Combine(TweetDeckPathParent,"TweetDeck");

        public static void Run(){
            if (!Program.UserConfig.IgnoreMigration && Directory.Exists(TweetDeckPath)){
                MigrationDecision decision;

                using(FormMigrationQuestion formQuestion = new FormMigrationQuestion()){
                    decision = formQuestion.ShowDialog() == DialogResult.OK ? formQuestion.Decision : MigrationDecision.AskLater;
                }

                switch(decision){
                    case MigrationDecision.MigratePurge:
                    case MigrationDecision.Migrate:
                    case MigrationDecision.Copy:
                        FormBackgroundWork formWait = new FormBackgroundWork();

                        formWait.ShowWorkDialog(() => {
                            if (!BeginMigration(decision,ex => formWait.Invoke(new Action(() => {
                                if (ex != null){
                                    MessageBox.Show(ex.ToString()); // TODO
                                }

                                formWait.Close();

                                Program.UserConfig.IgnoreMigration = true;
                                Program.UserConfig.Save();
                            })))){
                                formWait.Close();
                            }
                        });

                        break;

                    case MigrationDecision.Ignore:
                        Program.UserConfig.IgnoreMigration = true;
                        Program.UserConfig.Save();
                        break;
                }
            }
            else if (!Program.UserConfig.IgnoreUninstallCheck){
                string guid = ProgramRegistrySearch.FindByDisplayName("TweetDeck");

                if (guid != null && MessageBox.Show("TweetDeck is still installed on your computer, do you want to uninstall it?","Uninstall TweetDeck",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2) == DialogResult.Yes){
                    RunUninstaller(guid,0);
                    CleanupTweetDeck();
                }

                Program.UserConfig.IgnoreUninstallCheck = true;
                Program.UserConfig.Save();
            }
        }

        private static bool BeginMigration(MigrationDecision decision, Action<Exception> onFinished){
            if (decision != MigrationDecision.MigratePurge && decision != MigrationDecision.Migrate && decision != MigrationDecision.Copy){
                return false;
            }

            Task task = new Task(() => {
                Directory.CreateDirectory(Program.StoragePath);
                Directory.CreateDirectory(Path.Combine(Program.StoragePath,"localStorage"));
                Directory.CreateDirectory(Path.Combine(Program.StoragePath,"Local Storage"));

                CopyFile("Cookies");
                CopyFile("Cookies-journal");
                CopyFile("localStorage"+Path.DirectorySeparatorChar+"qrc__0.localstorage");
                CopyFile("Local Storage"+Path.DirectorySeparatorChar+"https_tweetdeck.twitter.com_0.localstorage");
                CopyFile("Local Storage"+Path.DirectorySeparatorChar+"https_tweetdeck.twitter.com_0.localstorage-journal");

                if (decision == MigrationDecision.Migrate || decision == MigrationDecision.MigratePurge){
                    // kill process if running
                    Process runningProcess = ProgramProcessSearch.FindProcessWithWindowByName("TweetDeck");

                    if (runningProcess != null){
                        runningProcess.CloseMainWindow();

                        for(int wait = 0; wait < 100 && !runningProcess.HasExited; wait++){ // 10 seconds
                            runningProcess.Refresh();
                            Thread.Sleep(100);
                        }
                            
                        runningProcess.Close();
                    }

                    // delete folders
                    for(int wait = 0; wait < 50; wait++){
                        try{
                            Directory.Delete(TweetDeckPath,true);
                            break;
                        }catch(Exception){
                            // browser subprocess not ended yet, wait
                            Thread.Sleep(300);
                        }
                    }

                    try{
                        Directory.Delete(TweetDeckPathParent,false);
                    }catch(IOException){
                        // most likely not empty, ignore
                    }
                }

                if (decision == MigrationDecision.MigratePurge){
                    // update the lnk files wherever possible (desktop icons, pinned taskbar, start menu)
                    foreach(string location in GetLnkDirectories()){
                        if (location == string.Empty)continue;

                        string linkFile = Path.Combine(location,"TweetDeck.lnk");

                        if (File.Exists(linkFile)){
                            LnkEditor lnk = new LnkEditor(linkFile);
                            lnk.SetPath(Application.ExecutablePath);
                            lnk.SetWorkingDirectory(Environment.CurrentDirectory);
                            lnk.SetComment(Program.BrandName); // TODO add a tagline
                            lnk.Save();

                            string renamed = Path.Combine(location,Program.BrandName+".lnk");

                            try{
                                if (File.Exists(renamed)){
                                    File.Delete(renamed);
                                }

                                File.Move(linkFile,renamed);
                            }catch{
                                // eh, too bad
                            }
                        }
                    }

                    Program.SHChangeNotify(0x8000000,0x1000,IntPtr.Zero,IntPtr.Zero); // refreshes desktop

                    // uninstall in the background
                    string guid = ProgramRegistrySearch.FindByDisplayName("TweetDeck");

                    if (guid != null){
                        RunUninstaller(guid,5000);
                    }

                    // registry cleanup
                    CleanupTweetDeck();

                    // migration finished like a boss
                }
            });

            task.ContinueWith(originalTask => onFinished(originalTask.Exception),TaskContinuationOptions.ExecuteSynchronously);
            task.Start();

            return true;
        }

        private static void CopyFile(string relativePath){
            try{
                File.Copy(Path.Combine(TweetDeckPath,relativePath),Path.Combine(Program.StoragePath,relativePath),true);
            }catch(FileNotFoundException){
            }catch(DirectoryNotFoundException){
            }
        }

        private static IEnumerable<string> GetLnkDirectories(){
            yield return Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            yield return Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
            yield return Environment.ExpandEnvironmentVariables(@"%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar");
            
            string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
            string[] sub = Directory.GetDirectories(startMenu);

            if (sub.Length > 0){
                yield return Path.Combine(startMenu,sub[0],"TweetDeck");
            }
        }

        private static void RunUninstaller(string guid, int timeout){
            Process uninstaller = Process.Start("msiexec.exe","/x "+guid+" /quiet /qn");

            if (uninstaller != null){
                if (timeout > 0){
                    uninstaller.WaitForExit(timeout); // it appears that the process is restarted or something that triggers this, but it shouldn't be a problem
                }

                uninstaller.Close();
            }
        }

        private static void CleanupTweetDeck(){
            try{
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\Twitter\TweetDeck",true);
                Registry.CurrentUser.DeleteSubKey(@"Software\Twitter"); // only if empty
            }catch(Exception){
                // not found or too bad
            }
        }
    }
}
