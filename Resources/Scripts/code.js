(function($, $TD, $TDX, TD){
  //
  // Variable: Current highlighted column jQuery & data objects.
  //
  var highlightedColumnEle, highlightedColumnObj;
  
  //
  // Variable: Currently highlighted tweet jQuery & data objects.
  //
  var highlightedTweetEle, highlightedTweetObj;
  
  //
  // Variable: Array of functions called after the website app is loaded.
  //
  var onAppReady = [];
  
  //
  // Variable: DOM object containing the main app element.
  //
  var app = $(document.body).children(".js-app");
  
  //
  // Constant: Column types mapped to their titles.
  //
  const columnTypes = {
    "col_home": "Home",
    "col_timeline" : "Home",
    "col_mentions": "Mentions",
    "col_me": "Mentions",
    "col_inbox": "Messages",
    "col_messages": "Messages",
    "col_interactions": "Notifications",
    "col_followers": "Followers",
    "col_activity": "Activity",
    "col_favorites": "Likes",
    "col_usertweets": "User",
    "col_search": "Search",
    "col_list": "List",
    "col_customtimeline": "Timeline",
    "col_dataminr": "Dataminr",
    "col_livevideo": "Live video",
    "col_scheduled": "Scheduled"
  };
  
  //
  // Function: Prepends code at the beginning of a function. If the prepended function returns true, execution of the original function is cancelled.
  //
  var prependToFunction = function(func, extension){
    return function(){
      return extension.apply(this, arguments) === true ? undefined : func.apply(this, arguments);
    };
  };
  
  //
  // Function: Appends code at the end of a function.
  //
  var appendToFunction = function(func, extension){
    return function(){
      let res = func.apply(this, arguments);
      extension.apply(this, arguments);
      return res;
    };
  };
  
  //
  // Function: Returns true if an object has a specified property, otherwise returns false without throwing an error.
  //
  var ensurePropertyExists = function(obj, ...chain){
    for(let index = 0; index < chain.length; index++){
      if (!obj.hasOwnProperty(chain[index])){
        $TD.crashDebug("Missing property "+chain[index]+" in chain [obj]."+chain.join("."));
        return false;
      }
      
      obj = obj[chain[index]];
    }
    
    return true;
  };
  
  //
  // Function: Retrieves a property of an element with a specified class.
  //
  var getClassStyleProperty = function(cls, property){
    let column = document.createElement("div");
    column.classList.add(cls);
    column.style.display = "none";
    
    document.body.appendChild(column);
    let value = window.getComputedStyle(column).getPropertyValue(property);
    document.body.removeChild(column);
    
    return value;
  };
  
  //
  // Function: Event callback for a new tweet.
  //
  var onNewTweet = (function(){
    let recentTweets = new Set();
    let recentTweetTimer = null;
    
    let startRecentTweetTimer = () => {
      if (recentTweetTimer){
        window.clearTimeout(recentTweetTimer);
      }
      
      recentTweetTimer = window.setTimeout(() => {
        recentTweetTimer = null;
        recentTweets.clear();
      }, 20000);
    };
    
    let checkRecentTweet = id => {
      if (recentTweets.size > 50){
        recentTweets.clear();
      }
      else if (recentTweets.has(id)){
        return true;
      }
      
      recentTweets.add(id);
      startRecentTweetTimer();
      return false;
    };
    
    let fixMedia = (html, media) => {
      return html.find(".js-media a[data-media-entity-id='"+media.mediaId+"']").css("background-image", 'url("'+media.thumb()+'")').removeClass("is-zoomable");
    };
    
    return function(column, tweet){
      if (checkRecentTweet(tweet.id)){
        return;
      }
      
      if (column.model.getHasNotification()){
        let previews = $TDX.notificationMediaPreviews;
        
        let html = $(tweet.render({
          withFooter: false,
          withTweetActions: false,
          withMediaPreview: true,
          isMediaPreviewOff: !previews,
          isMediaPreviewSmall: previews,
          isMediaPreviewLarge: false,
          isMediaPreviewCompact: false,
          isMediaPreviewInQuoted: previews,
          thumbSizeClass: "media-size-medium"
        }));
        
        html.css("border", "0");
        html.find("footer").last().remove(); // apparently withTweetActions breaks for certain tweets, nice
        html.find(".js-quote-detail").removeClass("is-actionable margin-b--8"); // prevent quoted tweets from changing the cursor and reduce bottom margin
        
        if (previews){
          html.find(".reverse-image-search").remove();
          
          for(let media of tweet.getMedia()){
            fixMedia(html, media);
          }
          
          if (tweet.quotedTweet){
            for(let media of tweet.quotedTweet.getMedia()){
              fixMedia(html, media).addClass("media-size-medium");
            }
          }
        }
        else if (tweet instanceof TD.services.TwitterActionOnTweet){
          html.find(".js-media").remove();
        }
        
        html.find("a[href='#']").each(function(){ // remove <a> tags around links that don't lead anywhere (such as account names the tweet replied to)
          this.outerHTML = this.innerHTML;
        });
        
        let type = tweet.getChirpType();
        
        if (type === "follow"){
          html.find(".js-user-actions-menu").parent().remove();
        }
        else if (type.includes("list_member")){
          html.find(".activity-header").first().css("margin-top", "2px");
          html.find(".avatar").first().css("margin-bottom", "0");
        }

        let source = tweet.getRelatedTweet();
        let duration = source ? source.text.length+(source.quotedTweet ? source.quotedTweet.text.length : 0) : tweet.text.length;
        let tweetUrl = source ? source.getChirpURL() : "";
        let quoteUrl = source && source.quotedTweet ? source.quotedTweet.getChirpURL() : "";

        $TD.onTweetPopup(columnTypes[column.getColumnType()] || "", html.html(), duration, tweetUrl, quoteUrl);
      }

      if (column.model.getHasSound()){
        $TD.onTweetSound();
      }
    };
  })();
  
  //
  // Function: Retrieves the tags to be put into <head> for notification HTML code.
  //
  var getNotificationHeadContents = function(){
    let tags = [];
    
    $(document.head).children("link[rel='stylesheet']:not([title]),link[title='"+TD.settings.getTheme()+"'],meta[charset],meta[http-equiv]").each(function(){
      tags.push($(this)[0].outerHTML);
    });
    
    tags.push("<style type='text/css'>");
    tags.push("body { background: "+getClassStyleProperty("column", "background-color")+" }"); // set background color
    tags.push("a[data-full-url] { word-break: break-all }"); // break long urls
    tags.push(".txt-base-smallest .badge-verified:before { height: 13px !important }"); // fix cut off badge icon
    tags.push(".activity-header { align-items: center !important; margin-bottom: 4px }"); // tweak alignment of avatar and text in notifications
    tags.push(".activity-header .tweet-timestamp { line-height: unset }"); // fix timestamp position in notifications
    tags.push("</style>");
    
    return tags.join("");
  };
  
  //
  // Block: Hook into settings object to detect when the settings change.
  //
  TD.settings.setFontSize = appendToFunction(TD.settings.setFontSize, function(name){
    $TD.loadFontSizeClass(name);
  });
  
  TD.settings.setTheme = appendToFunction(TD.settings.setTheme, function(name){
    document.documentElement.setAttribute("data-td-theme", name);
    
    setTimeout(function(){
      $TD.loadNotificationHeadContents(getNotificationHeadContents());
    }, 0);
  });
  
  onAppReady.push(function(){
    document.documentElement.setAttribute("data-td-theme", TD.settings.getTheme());
    
    $TD.loadFontSizeClass(TD.settings.getFontSize());
    $TD.loadNotificationHeadContents(getNotificationHeadContents());
  });
  
  //
  // Block: Enable popup notifications.
  //
  if (ensurePropertyExists(TD, "controller", "notifications")){
    TD.controller.notifications.hasNotifications = function(){
      return true;
    };

    TD.controller.notifications.isPermissionGranted = function(){
      return true;
    };
  }
  
  $.subscribe("/notifications/new", function(obj){
    for(let index = obj.items.length-1; index >= 0; index--){
      onNewTweet(obj.column, obj.items[index]);
    }
  });
  
  //
  // Block: Add TweetDuck buttons to the settings menu.
  //
  onAppReady.push(function(){
    $("[data-action='settings-menu']").click(function(){
      setTimeout(function(){
        let menu = $(".js-dropdown-content").children("ul").first();
        if (menu.length === 0)return;
        
        menu.children(".drp-h-divider").last().before('<li class="is-selectable" data-std><a href="#" data-action="tweetduck">TweetDuck</a></li>');
        
        let button = menu.children("[data-std]");

        button.on("click", "a", function(){
          $TD.openContextMenu();
        });

        button.hover(function(){
          $(this).addClass("is-selected");
        }, function(){
          $(this).removeClass("is-selected");
        });
      }, 0);
    });
  });
  
  //
  // Block: Expand shortened links on hover or display tooltip.
  //
  (function(){
    var cutStart = function(str, search){
      return str.startsWith(search) ? str.substr(search.length) : str;
    };
    
    var prevMouseX = -1, prevMouseY = -1;
    var tooltipTimer, tooltipDisplayed;
    
    $(document.body).delegate("a[data-full-url]", "mouseenter mouseleave mousemove", function(e){
      var me = $(this);

      if (e.type === "mouseenter"){
        let text = me.text();
        
        if (text.charCodeAt(text.length-1) !== 8230){ // horizontal ellipsis
          return;
        }
        
        if ($TDX.expandLinksOnHover){
          tooltipTimer = window.setTimeout(function(){
            let expanded = me.attr("data-full-url");
            expanded = cutStart(expanded, "https://");
            expanded = cutStart(expanded, "http://");
            expanded = cutStart(expanded, "www.");

            me.attr("td-prev-text", text);
            me.text(expanded);
          }, 200);
        }
        else{
          tooltipTimer = window.setTimeout(function(){
            $TD.displayTooltip(me.attr("data-full-url"), false);
            tooltipDisplayed = true;
          }, 400);
        }
      }
      else if (e.type === "mouseleave"){
        if ($TDX.expandLinksOnHover){
          let prevText = me.attr("td-prev-text");

          if (prevText){
            me.text(prevText);
          }
        }
        
        window.clearTimeout(tooltipTimer);
        
        if (tooltipDisplayed){
          tooltipDisplayed = false;
          $TD.displayTooltip(null, false);
        }
      }
      else if (e.type === "mousemove"){
        if (tooltipDisplayed && (prevMouseX !== e.clientX || prevMouseY !== e.clientY)){
          $TD.displayTooltip(me.attr("data-full-url"), false);
          prevMouseX = e.clientX;
          prevMouseY = e.clientY;
        }
      }
    });
  })();
  
  //
  // Block: Allow bypassing of t.co and include media previews in context menus.
  //
  $(document.body).delegate("a", "contextmenu", function(){
    $TD.setLastRightClickedLink($(this).attr("data-full-url") || "");
  });
  
  $(document.body).delegate("a.js-media-image-link", "contextmenu", function(){
    let me = $(this)[0];
    
    if (me.firstElementChild){
      $TD.setLastRightClickedImage(me.firstElementChild.getAttribute("src"));
    }
    else{
      $TD.setLastRightClickedImage(me.style.backgroundImage.replace(/url\(['"]?(.*?)['"]?\)/, "$1"));
    }
  });
  
  //
  // Block: Hook into the notification sound effect.
  //
  (function(){
    let soundEle = document.getElementById("update-sound");
    
    soundEle.play = prependToFunction(soundEle.play, function(){
      return $TDX.muteNotifications || $TDX.hasCustomNotificationSound;
    });
  })();
  
  //
  // Block: Update highlighted column and tweet for context menu and other functionality.
  //
  (function(){
    var lastTweet = "";
    
    var updateHighlightedColumn = function(ele){
      highlightedColumnEle = ele;
      highlightedColumnObj = ele ? TD.controller.columnManager.get(ele.attr("data-column")) : null;
      return !!highlightedColumnObj;
    };
    
    var updateHighlightedTweet = function(ele, obj, link, embeddedLink, imageList){
      highlightedTweetEle = ele;
      highlightedTweetObj = obj;
      
      if (lastTweet !== link){
        $TD.setLastHighlightedTweet(link, embeddedLink, imageList);
        lastTweet = link;
      }
    };
    
    app.delegate("section.js-column", "mouseenter mouseleave", function(e){
      if (e.type === "mouseenter"){
        if (!highlightedColumnObj){
          updateHighlightedColumn($(this));
        }
      }
      else if (e.type === "mouseleave"){
        updateHighlightedColumn(null);
      }
    });
    
    app.delegate("article.js-stream-item", "mouseenter mouseleave", function(e){
      if (e.type === "mouseenter"){
        let me = $(this);
        
        if (!me[0].hasAttribute("data-account-key") || (!highlightedColumnObj && !updateHighlightedColumn(me.closest("section.js-column")))){
          return;
        }
        
        let tweet = highlightedColumnObj.findChirp(me.attr("data-tweet-id")) || highlightedColumnObj.findChirp(me.attr("data-key"));
        
        if (tweet){
          if (tweet.chirpType === TD.services.ChirpBase.TWEET){
            let link = tweet.getChirpURL();
            let embedded = tweet.quotedTweet ? tweet.quotedTweet.getChirpURL() : "";
            let images = tweet.hasImage() ? tweet.getMedia().filter(item => !item.isAnimatedGif).map(item => item.entity.media_url_https+":small").join(";") : "";
            // TODO maybe handle embedded images too?
            
            updateHighlightedTweet(me, tweet, link || "", embedded || "", images);
          }
          else{
            updateHighlightedTweet(me, tweet, "", "", "");
          }
        }
      }
      else if (e.type === "mouseleave"){
        updateHighlightedTweet(null, null, "", "", "");
      }
    });
  })();
  
  //
  // Block: Screenshot tweet to clipboard.
  //
  (function(){
    var selectedTweet;
    
    var setImportantProperty = function(obj, property, value){
      if (obj.length === 1){
        obj[0].style.setProperty(property, value, "important");
      }
    };
    
    app.delegate("article.js-stream-item", "contextmenu", function(){
      selectedTweet = $(this);
    });
    
    window.TDGF_triggerScreenshot = function(){
      if (selectedTweet){
        let tweetWidth = Math.floor(selectedTweet.width());
        let parent = selectedTweet.parent();
        
        let isDetail = parent.hasClass("js-tweet-detail");
        let isReply = !isDetail && (parent.hasClass("js-replies-to") || parent.hasClass("js-replies-before"));
        
        selectedTweet = selectedTweet.clone();
        selectedTweet.children().first().addClass($(document.documentElement).attr("class")).css("padding-bottom", "0");
        
        setImportantProperty(selectedTweet.find(".js-tweet-text"), "margin-bottom", "8px");
        setImportantProperty(selectedTweet.find(".js-quote-detail"), "margin-bottom", "10px");
        setImportantProperty(selectedTweet.find(".js-poll-link").next(), "margin-bottom", "8px");
        
        if (isDetail){
          if (selectedTweet.find("[class*='media-grid-']").length > 0){
            setImportantProperty(selectedTweet.find(".js-tweet-media"), "margin-bottom", "10px");
          }
          else{
            setImportantProperty(selectedTweet.find(".js-tweet-media"), "margin-bottom", "6px");
          }
          
          setImportantProperty(selectedTweet.find(".js-media-preview-container"), "margin-bottom", "4px");
          selectedTweet.find(".js-translate-call-to-action").first().remove();
          selectedTweet.find(".js-tweet").first().nextAll().remove();
          selectedTweet.find("footer").last().prevUntil(":not(.txt-mute.txt-small)").addBack().remove(); // footer, date, location
        }
        else{
          setImportantProperty(selectedTweet.find(".js-media-preview-container"), "margin-bottom", "10px");
          selectedTweet.find("footer").last().remove();
        }
        
        if (isReply){
          selectedTweet.find(".is-conversation").removeClass("is-conversation");
        }
        
        selectedTweet.find(".js-poll-link").remove();
        selectedTweet.find(".td-screenshot-remove").remove();
        
        let testTweet = selectedTweet.clone().css({
          position: "absolute",
          left: "-999px",
          width: tweetWidth+"px"
        }).appendTo(document.body);
        
        let realHeight = Math.floor(testTweet.height());
        testTweet.remove();
        
        $TD.screenshotTweet(selectedTweet.html(), tweetWidth, realHeight);
      }
    };
  })();
  
  //
  // Block: Paste images when tweeting.
  //
  onAppReady.push(function(){
    var uploader = $._data(document, "events")["uiComposeAddImageClick"][0].handler.context;
    
    app.delegate(".js-compose-text,.js-reply-tweetbox", "paste", function(e){
      for(let item of e.originalEvent.clipboardData.items){
        if (item.type.startsWith("image/")){
          $(this).closest(".rpl").find(".js-reply-popout").click(); // popout direct messages
          uploader.addFilesToUpload([ item.getAsFile() ]);
          
          $(".js-compose-text", ".js-docked-compose").focus();
          break;
        }
      }
    });
  });
  
  //
  // Block: Support for extra mouse buttons.
  //
  (function(){
    var tryClickSelector = function(selector, parent){
      return $(selector, parent).click().length;
    };
    
    var tryCloseModal1 = function(){
      let modal = $("#open-modal");
      return modal.is(":visible") && tryClickSelector("a.mdl-dismiss", modal);
    };
    
    var tryCloseModal2 = function(){
      let modal = $(".js-modals-container");
      return modal.length && tryClickSelector("a.mdl-dismiss", modal);
    };
    
    var tryCloseHighlightedColumn = function(){
      if (highlightedColumnEle){
        let column = highlightedColumnEle.closest(".js-column");
        return (column.is(".is-shifted-2") && tryClickSelector(".js-tweet-social-proof-back", column)) || (column.is(".is-shifted-1") && tryClickSelector(".js-column-back", column));
      }
    };
    
    window.TDGF_onMouseClickExtra = function(button){
      if (button === 1){ // back button
        tryClickSelector(".is-shifted-2 .js-tweet-social-proof-back", ".js-modal-panel") ||
        tryClickSelector(".is-shifted-1 .js-column-back", ".js-modal-panel") ||
        tryCloseModal1() ||
        tryCloseModal2() ||
        tryClickSelector(".js-inline-compose-close") ||
        tryCloseHighlightedColumn() ||
        tryClickSelector(".js-app-content.is-open .js-drawer-close:visible") ||
        tryClickSelector(".is-shifted-2 .js-tweet-social-proof-back, .is-shifted-2 .js-dm-participants-back") ||
        $(".is-shifted-1 .js-column-back").click();
      }
      else if (button === 2){ // forward button
        if (highlightedTweetEle){
          highlightedTweetEle.children().first().click();
        }
      }
    };
  })();
  
  //
  // Block: Fix scheduled tweets not showing up sometimes.
  //
  $(document).on("dataTweetSent", function(e, data){
    if (data.response.state && data.response.state === "scheduled"){
      let column = Object.values(TD.controller.columnManager.getAll()).find(column => column.model.state.type === "scheduled");

      if (column){
        setTimeout(function(){
          column.reloadTweets();
        }, 1000);
      }
    }
  });
  
  //
  // Block: Hold Shift to restore cleared column.
  //
  (function(){
    var holdingShift = false;
    
    var updateShiftState = (pressed) => {
      if (pressed != holdingShift){
        holdingShift = pressed;
        $("button[data-action='clear']").children("span").text(holdingShift ? "Restore" : "Clear");
      }
    };
    
    var resetActiveFocus = () => {
      document.activeElement.blur();
    };
    
    $(document).keydown(function(e){
      if (e.shiftKey && (document.activeElement === null || !("value" in document.activeElement))){
        updateShiftState(true);
      }
    }).keyup(function(e){
      if (!e.shiftKey){
        updateShiftState(false);
      }
    });
    
    if (!ensurePropertyExists(TD, "vo", "Column", "prototype", "clear")){
      return;
    }
    
    TD.vo.Column.prototype.clear = prependToFunction(TD.vo.Column.prototype.clear, function(){
      window.setTimeout(resetActiveFocus, 0); // unfocuses the Clear button, otherwise it steals keyboard input
      
      if (holdingShift){
        this.model.setClearedTimestamp(0);
        this.reloadTweets();
        return true;
      }
    });
  })();
  
  //
  // Block: Swap shift key functionality for selecting accounts, and refocus the textbox afterwards.
  //
  onAppReady.push(function(){
    var onAccountClick = function(e){
      if ($TDX.switchAccountSelectors){
        e.shiftKey = !e.shiftKey;
      }
      
      $(".js-compose-text", ".js-docked-compose").focus();
    };
    
    $(".js-drawer[data-drawer='compose']").delegate(".js-account-list > .js-account-item", "click", onAccountClick);
    
    if (!ensurePropertyExists(TD, "components", "AccountSelector", "prototype", "refreshPostingAccounts")){
      return;
    }
    
    TD.components.AccountSelector.prototype.refreshPostingAccounts = appendToFunction(TD.components.AccountSelector.prototype.refreshPostingAccounts, function(){
      if (!this.$node.attr("td-account-selector-hook")){
        this.$node.attr("td-account-selector-hook", "1");
        this.$node.delegate(".js-account-item", "click", onAccountClick);
      }
    });
  });
  
  //
  // Block: Make middle click on tweet reply icon open the compose drawer.
  //
  app.delegate(".js-reply-action", "mousedown", function(e){
    if (e.which === 2){
      if ($("[data-drawer='compose']").hasClass("is-hidden")){
        $(document).trigger("uiDrawerShowDrawer", {
          drawer: "compose",
          withAnimation: true
        });
        
        window.setTimeout(() => $(this).trigger("click"), 1);
      }
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  });
  
  //
  // Block: Work around clipboard HTML formatting.
  //
  $(document).on("copy", function(e){
    window.setTimeout($TD.fixClipboard, 0);
  });
  
  //
  // Block: Inject custom CSS and layout into the page.
  //
  (function(){
    let styleOfficial = document.createElement("style");
    document.head.appendChild(styleOfficial);
    
    let addRule = (rule) => {
      styleOfficial.sheet.insertRule(rule, 0);
    };
    
    addRule("a[data-full-url] { word-break: break-all; }"); // break long urls
    addRule(".keyboard-shortcut-list { vertical-align: top; }"); // fix keyboard navigation alignment
    addRule(".account-inline .username { vertical-align: 10%; }"); // move usernames a bit higher
    addRule(".character-count-compose { width: 40px !important; }"); // fix strangely wide character count element
    
    addRule(".column-nav-link .attribution { position: absolute; }"); // fix cut off account names
    addRule(".txt-base-smallest .sprite-verified-mini { width: 13px !important; height: 13px !important; background-position: -223px -99px !important; }"); // fix cut off badge icon when zoomed in
    
    addRule(".btn, .mdl, .mdl-content, .app-search-fake, .app-search-input, .popover, .lst-modal, .media-item { border-radius: 1px !important; }"); // square-ify buttons, inputs, dialogs, menus, media previews
    addRule(".dropdown-menu, .list-item-last, .quoted-tweet { border-radius: 0 !important; }"); // square-ify dropdowns, quoted tweets, and account selectors
    addRule(".prf-header { border-radius: 0; }"); // fix user account header border
    
    addRule(".accs li, .accs img { border-radius: 0 !important; }"); // square-ify retweet account selector
    addRule(".accs-header { padding-left: 0 !important; }"); // fix retweet account selector heading
    
    addRule(".scroll-styled-v::-webkit-scrollbar-thumb, .scroll-styled-h::-webkit-scrollbar-thumb, .antiscroll-scrollbar { border-radius: 0; }"); // square-ify scroll bars
    addRule(".antiscroll-scrollbar-vertical { margin-top: 0; }"); // square-ify scroll bars
    addRule(".antiscroll-scrollbar-horizontal { margin-left: 0; }"); // square-ify scroll bars
    addRule(".scroll-styled-v:not(.antiscroll-inner)::-webkit-scrollbar { width: 8px; }"); // square-ify scroll bars
    addRule(".scroll-styled-h:not(.antiscroll-inner)::-webkit-scrollbar { height: 8px; }"); // square-ify scroll bars
    addRule(".app-columns-container::-webkit-scrollbar { height: 9px !important; }"); // square-ify scroll bars
    
    addRule(".is-condensed .app-header-inner { padding-top: 10px !important; }"); // add extra padding to menu buttons when condensed
    addRule(".is-condensed .btn-compose { padding: 8px !important; }"); // fix compose button icon when condensed
    addRule(".app-header:not(.is-condensed) .nav-user-info { padding: 0 5px; }"); // add padding to user info
    
    addRule(".app-title { display: none; }"); // hide TweetDeck logo
    addRule(".nav-user-info { bottom: 10px !important; }"); // move user info
    addRule(".app-navigator { bottom: 50px !important; }"); // move navigation
    addRule(".column-navigator-overflow { bottom: 192px !important; }"); // move column list
    addRule(".app-navigator .tooltip { display: none !important; }"); // hide broken tooltips in the menu
    
    addRule(".column .column-header { height: 49px !important; }"); // fix one pixel space below column header
    addRule(".column:not(.is-options-open) .column-header { border-bottom: none; }"); // fix one pixel space below column header
    addRule(".is-options-open .column-type-icon { bottom: 27px; }"); // fix one pixel space below column header
    
    addRule(".activity-header { align-items: center !important; margin-bottom: 4px; }"); // tweak alignment of avatar and text in notifications
    addRule(".activity-header .tweet-timestamp { line-height: unset; }"); // fix timestamp position in notifications
    
    addRule("html[data-td-theme='light'] .stream-item:not(:hover) .js-user-actions-menu { color: #000; border-color: #000; opacity: 0.25; }"); // make follow notification button nicer
    addRule("html[data-td-theme='dark'] .stream-item:not(:hover) .js-user-actions-menu { color: #fff; border-color: #fff; opacity: 0.25; }"); // make follow notification button nicer
    
    addRule(".app-columns-container::-webkit-scrollbar-track { border-left: 0; }"); // remove weird border in the column container scrollbar
    addRule(".app-columns-container { bottom: 0 !important; }"); // move column container scrollbar to bottom to fit updated style
    
    addRule(".js-column-header .column-header-link { padding: 0; }"); // fix column header tooltip hover box
    addRule(".js-column-header .column-header-link .icon { padding: 9px 4px; width: calc(1em + 8px); height: 100%; box-sizing: border-box; }"); // fix column header tooltip hover box
    
    addRule(".is-video a:not([href*='youtu']), .is-gif .js-media-gif-container { cursor: alias; }"); // change cursor on unsupported videos
    addRule(".is-video a:not([href*='youtu']) .icon-bg-dot, .is-gif .icon-bg-dot { color: #bd3d37; }"); // change play icon color on unsupported videos
    
    window.TDGF_reinjectCustomCSS = function(styles){
      $("#tweetduck-custom-css").remove();
      
      if (styles && styles.length){
        $(document.head).append("<style type='text/css' id='tweetduck-custom-css'>"+styles+"</style>");
      }
    };
  })();
  
  //
  // Block: Let's make retweets lowercase again.
  //
  TD.mustaches["status/tweet_single.mustache"] = TD.mustaches["status/tweet_single.mustache"].replace("{{_i}} Retweeted{{/i}}", "{{_i}} retweeted{{/i}}");
  
  if (ensurePropertyExists(TD, "services", "TwitterActionRetweet", "prototype", "generateText")){
    TD.services.TwitterActionRetweet.prototype.generateText = appendToFunction(TD.services.TwitterActionRetweet.prototype.generateText, function(){
      this.text = this.text.replace(" Retweeted", " retweeted");
      this.htmlText = this.htmlText.replace(" Retweeted", " retweeted");
    });
  }
  
  if (ensurePropertyExists(TD, "services", "TwitterActionRetweetedInteraction", "prototype", "generateText")){
    TD.services.TwitterActionRetweetedInteraction.prototype.generateText = appendToFunction(TD.services.TwitterActionRetweetedInteraction.prototype.generateText, function(){
      this.htmlText = this.htmlText.replace(" Retweeted", " retweeted").replace(" Retweet", " retweet");
    });
  }
  
  //
  // Block: Setup unsupported video element hook.
  //
  (function(){
    var cancelModal = false;
    
    if (!ensurePropertyExists(TD, "components", "MediaGallery", "prototype", "_loadTweet") ||
        !ensurePropertyExists(TD, "components", "BaseModal", "prototype", "setAndShowContainer") ||
        !ensurePropertyExists(TD, "ui", "Column", "prototype", "playGifIfNotManuallyPaused"))return;
    
    TD.components.MediaGallery.prototype._loadTweet = appendToFunction(TD.components.MediaGallery.prototype._loadTweet, function(){
      let media = this.chirp.getMedia().find(media => media.mediaId === this.clickedMediaEntityId);

      if (media && media.isVideo && media.service !== "youtube"){
        $TD.openBrowser(this.clickedLink);
        cancelModal = true;
      }
    });

    TD.components.BaseModal.prototype.setAndShowContainer = prependToFunction(TD.components.BaseModal.prototype.setAndShowContainer, function(){
      if (cancelModal){
        cancelModal = false;
        return true;
      }
    });
    
    TD.ui.Column.prototype.playGifIfNotManuallyPaused = function(){};
    TD.mustaches["status/media_thumb.mustache"] = TD.mustaches["status/media_thumb.mustache"].replace("is-gif", "is-gif is-paused");
    
    app.delegate(".js-gif-play", "click", function(e){
      let parent = $(e.target).closest(".js-tweet").first();
      let link = (parent.hasClass("tweet-detail") ? parent.find("a[rel='url']") : parent.find("time").first().children("a")).first();
      
      $TD.openBrowser(link.attr("href"));
      e.stopPropagation();
    });
  })();
  
  //
  // Block: Fix youtu.be previews not showing up for https links.
  //
  if (ensurePropertyExists(TD, "services", "TwitterMedia")){
    let media = TD.services.TwitterMedia;
    
    if (!ensurePropertyExists(media, "YOUTUBE_TINY_RE") ||
        !ensurePropertyExists(media, "YOUTUBE_LONG_RE") ||
        !ensurePropertyExists(media, "YOUTUBE_RE") ||
        !ensurePropertyExists(media, "SERVICES", "youtube"))return;
    
    media.YOUTUBE_TINY_RE = new RegExp(media.YOUTUBE_TINY_RE.source.replace("http:", "https?:"));
    media.YOUTUBE_RE = new RegExp(media.YOUTUBE_LONG_RE.source+"|"+media.YOUTUBE_TINY_RE.source);
    media.SERVICES["youtube"] = media.YOUTUBE_RE;
  }
  
  //
  // Block: Fix DM reply input box not getting focused after opening a conversation.
  //
  if (ensurePropertyExists(TD, "components", "ConversationDetailView", "prototype", "showChirp")){
    TD.components.ConversationDetailView.prototype.showChirp = appendToFunction(TD.components.ConversationDetailView.prototype.showChirp, function(){
      setTimeout(function(){
        $(".js-reply-tweetbox").first().focus();
      }, 100);
    });
  }
  
  //
  // Block: Fix DM notifications not showing if the conversation is open.
  //
  if (ensurePropertyExists(TD, "services", "TwitterConversation", "prototype", "getUnreadChirps")){
    var prevFunc = TD.services.TwitterConversation.prototype.getUnreadChirps;
    
    TD.services.TwitterConversation.prototype.getUnreadChirps = function(e){
      return (e && e.sortIndex && !e.id && !this.notificationsDisabled)
        ? this.messages.filter(t => t.chirpType === TD.services.ChirpBase.MESSAGE && !t.isOwnChirp() && !t.read && !t.belongsBelow(e)) // changed from belongsAbove
        : prevFunc.apply(this, arguments);
    };
  }
  
  //
  // Block: Custom reload function with memory cleanup.
  //
  window.TDGF_reload = function(){
    let session = TD.storage.feedController.getAll()
                    .filter(feed => !!feed.getTopSortIndex())
                    .reduce((obj, feed) => (obj[feed.privateState.key] = feed.getTopSortIndex(), obj), {});
    
    $TD.setSessionData("gc", JSON.stringify(session)).then(() => {
      window.gc && window.gc();
      window.location.reload();
    });
  };
  
  window.TDGF_tryRunCleanup = function(){
    // all textareas are empty
    if ($("textarea").is(function(){
      return $(this).val().length > 0;
    })){
      return false;
    }
    
    // no modals are visible
    if ($("#open-modal").is(":visible") || !$(".js-modals-container").is(":empty")){
      return false;
    }
    
    // all columns are in a default state
    if ($("section.js-column").is(".is-shifted-1,.is-shifted-2")){
      return false;
    }
    
    // all columns are scrolled to top
    if ($(".js-column-scroller").is(function(){
      return $(this).scrollTop() > 0;
    })){
      return false;
    }
    
    // cleanup
    window.TDGF_reload();
    return true;
  };
  
  if (window.TD_SESSION && window.TD_SESSION.gc){
    var state;
    
    try{
      state = JSON.parse(window.TD_SESSION.gc);
    }catch(err){
      $TD.crashDebug("Invalid session gc data: "+window.TD_SESSION.gc);
      state = {};
    }
    
    var showMissedNotifications = function(){
      let tweets = [];
      let columns = {};
      
      let tmp = new TD.services.ChirpBase;
      
      for(let column of Object.values(TD.controller.columnManager.getAll())){
        for(let feed of column.getFeeds()){
          if (feed.privateState.key in state){
            tmp.sortIndex = state[feed.privateState.key];
            
            for(let tweet of [].concat.apply([], column.updateArray.map(function(chirp){
              return chirp.getUnreadChirps(tmp);
            }))){
              tweets.push(tweet);
              columns[tweet.id] = column;
            }
          }
        }
      }
      
      tweets.sort(TD.util.chirpReverseColumnSort);
      
      for(let tweet of tweets){
        onNewTweet(columns[tweet.id], tweet);
      }
    };
    
    $(document).one("dataColumnsLoaded", function(){
      let columns = Object.values(TD.controller.columnManager.getAll());
      let remaining = columns.length;

      for(let column of columns){
        column.ui.getChirpContainer().one("dataColumnFeedUpdated", () => {
          if (--remaining === 0){
            setTimeout(showMissedNotifications, 1);
          }
        });
      }
    });
  }
  
  //
  // Block: Disable TweetDeck metrics.
  //
  if (ensurePropertyExists(TD, "metrics")){
    TD.metrics.inflate = function(){};
    TD.metrics.inflateMetricTriple = function(){};
    TD.metrics.log = function(){};
    TD.metrics.makeKey = function(){};
    TD.metrics.send = function(){};
  }
  
  onAppReady.push(function(){
    let data = $._data(window);
    delete data.events["metric"];
    delete data.events["metricsFlush"];
  });
  
  //
  // Block: Register the TD.ready event, finish initialization, and load plugins.
  //
  $(document).one("TD.ready", function(){
    onAppReady.forEach(func => func());
    onAppReady = null;
    
    delete window.TD_SESSION;
    
    if (window.TD_PLUGINS){
      window.TD_PLUGINS.onReady();
    }
  });
  
  //
  // Block: Skip the initial pre-login page.
  //
  if (ensurePropertyExists(TD, "controller", "init", "showLogin")){
    TD.controller.init.showLogin = function(){
      location.href = "https://twitter.com/login?hide_message=true&redirect_after_login=https%3A%2F%2Ftweetdeck.twitter.com%2F%3Fvia_twitter_login%3Dtrue";
    };
  }
})($, $TD, $TDX, TD);
