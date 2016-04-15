﻿using CefSharp;

namespace TweetDck.Core.Handling{
    class ContextMenuBrowser : ContextMenuBase{
        private const int MenuSettings = 26600;
        private const int MenuAbout = 26601;

        private readonly FormBrowser form;

        public ContextMenuBrowser(FormBrowser form){
            this.form = form;
        }

        public override void OnBeforeContextMenu(IWebBrowser browserControl, IBrowser browser, IFrame frame, IContextMenuParams parameters, IMenuModel model){
            model.Remove(CefMenuCommand.Back);
            model.Remove(CefMenuCommand.Forward);
            model.Remove(CefMenuCommand.Print);
            model.Remove(CefMenuCommand.ViewSource);

            RemoveSeparatorIfFirst(model);

            base.OnBeforeContextMenu(browserControl,browser,frame,parameters,model);
            
            model.AddItem(CefMenuCommand.Reload,"Reload");
            model.AddSeparator();

            if (TweetNotification.IsReady){
                model.AddItem((CefMenuCommand)MenuSettings,"Settings");
            }

            model.AddItem((CefMenuCommand)MenuAbout,"About "+Program.BrandName);
        }

        public override bool OnContextMenuCommand(IWebBrowser browserControl, IBrowser browser, IFrame frame, IContextMenuParams parameters, CefMenuCommand commandId, CefEventFlags eventFlags){
            if (base.OnContextMenuCommand(browserControl,browser,frame,parameters,commandId,eventFlags)){
                return true;
            }

            switch((int)commandId){
                case MenuSettings:
                    form.InvokeSafe(() => {
                        form.OpenSettings();
                    });

                    return true;

                case MenuAbout:
                    form.InvokeSafe(() => {
                        form.OpenAbout();
                    });

                    return true;
            }

            return false;
        }
    }
}
