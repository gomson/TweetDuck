(function($,$TD,TD){
  //
  // Variable: Says whether TweetD*ck events was initialized.
  //
  var isInitialized = false;
  
  //
  // Variable: Current highlighted column jQuery object.
  //
  var highlightedColumnEle;
  
  //
  // Variable: Currently highlighted tweet jQuery object.
  //
  var highlightedTweetEle;
  
  //
  // Function: Initializes TweetD*ck events. Called after the website app is loaded.
  //
  var initializeTweetDck = function(){
    // Settings button hook
    $("[data-action='settings-menu']").click(function(){
      setTimeout(function(){
        var menu = $(".js-dropdown-content").children("ul").first();
        if (menu.length === 0)return;

        menu.children(".drp-h-divider").last().after('<li class="is-selectable" data-std><a href="#" data-action>'+$TD.brandName+' settings</a></li><li class="drp-h-divider"></li>');

        var tweetDckBtn = menu.children("[data-std]").first();

        tweetDckBtn.on("click","a",function(){
          $TD.openSettingsMenu();
        });

        tweetDckBtn.hover(function(){
          $(this).addClass("is-selected");
        },function(){
          $(this).removeClass("is-selected");
        });
      },0);
    });
    
    // Fix layout for right-aligned actions menu
    $(document).on("uiShowActionsMenu",function(){
      $(".js-dropdown.pos-r").toggleClass("pos-r pos-l");
    });
    
    // Notification handling
    $.subscribe("/notifications/new",function(obj){
      for(let index = obj.items.length-1; index >= 0; index--){
        onNewTweet(obj.column,obj.items[index]);
      }
    });
    
    // Finish init
    $TD.loadFontSizeClass(TD.settings.getFontSize());
    $TD.loadNotificationHeadContents(getNotificationHeadContents());
    
    isInitialized = true;
  };
  
  //
  // Function: Prepends code at the beginning of a function. If the prepended function returns true, execution of the original function is cancelled.
  //
  var prependToFunction = function(func, extension){
    return function(){
      return extension.apply(this,arguments) === true ? undefined : func.apply(this,arguments);
    };
  };
  
  //
  // Function: Appends code at the end of a function.
  //
  var appendToFunction = function(func, extension){
    return function(){
      var res = func.apply(this,arguments);
      extension.apply(this,arguments);
      return res;
    };
  };
  
  //
  // Function: Event callback for a new tweet.
  //
  var onNewTweet = function(column, tweet){
    if (column.model.getHasNotification()){
      var html = $(tweet.render({
        withFooter: false,
        withTweetActions: false,
        withMediaPreview: false
      }));

      html.css("border","0");
      html.find(".tweet-body").first().children("footer").remove();
      
      var url = html.find("time").first().children("a").first().attr("href") || "";
      
      $TD.onTweetPopup(html.html(),url,tweet.text.length); // TODO column
    }
    else if (column.model.getHasSound()){
      $TD.onTweetSound(); // TODO disable original
    }
  };
  
  //
  // Function: Retrieves the tags to be put into <head> for notification HTML code.
  //
  var getNotificationHeadContents = function(){
    var tags = [];
    
    $(document.head).children("link[rel='stylesheet'],meta[charset],meta[http-equiv]").each(function(){
      tags.push($(this)[0].outerHTML);
    });
    
    return tags.join("");
  };
  
  //
  // Block: Observe the app <div> element and initialize TweetD*ck whenever possible.
  //
  var app = $("body").children(".js-app");
  
  new MutationObserver(function(){
    if (isInitialized && app.hasClass("is-hidden")){
      isInitialized = false;
    }
    else if (!isInitialized && !app.hasClass("is-hidden")){
      initializeTweetDck();
    }
  }).observe(app[0],{
    attributes: true,
    attributeFilter: [ "class" ]
  });
  
  //
  // Block: Hook into settings object to detect when the settings change.
  //
  TD.settings.setFontSize = appendToFunction(TD.settings.setFontSize,function(name){
    $TD.loadFontSizeClass(name);
  });
  
  TD.settings.setTheme = appendToFunction(TD.settings.setTheme,function(){
    setTimeout(function(){
      $TD.loadNotificationHeadContents(getNotificationHeadContents());
    },0);
  });
  
  //
  // Block: Force popup notification settings.
  //
  TD.controller.notifications.hasNotifications = function(){
    return true;
  };

  TD.controller.notifications.isPermissionGranted = function(){
    return true;
  };
  
  //
  // Block: Hook into links to bypass default open function.
  //
  (function(){
    var urlWait = false;
    
    var onUrlOpened = function(){
      urlWait = true;
      setTimeout(function(){ urlWait = false; },0);
    };
    
    $(document.body).delegate("a[target='_blank']","click",function(e){
      if (urlWait)return;

      var me = $(this);
      var rel = me.attr("rel");

      if (!me.is(".link-complex") && !(rel === "mediaPreview" && me.closest("#open-modal").length === 0) && rel !== "list" && rel !== "user" && rel !== "tweet"){
        $TD.openBrowser(me.attr("href"));
        onUrlOpened();
      }
      
      e.preventDefault();
    });
    
    window.open = function(url){
      if (urlWait)return;
      
      $TD.openBrowser(url);
      onUrlOpened();
    };
    
    TD.util.maybeOpenClickExternally = prependToFunction(TD.util.maybeOpenClickExternally,function(e){
      if (e.ctrlKey){
        if (urlWait)return;

        $TD.openBrowser(e.currentTarget.getAttribute("href"));
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return true;
      }
    });
  })();
  
  //
  // Block: Expand shortened links on hover or display tooltip.
  //
  (function(){
    var cutStart = function(str, search){
      return str.startsWith(search) ? str.substr(search.length) : str;
    };
    
    var prevMouseX = -1, prevMouseY = -1;
    var tooltipTimer, tooltipDisplayed;
    
    $(document.body).delegate("a[data-full-url]","mouseenter mouseleave mousemove",function(e){
      var me = $(this);

      if (e.type === "mouseenter"){
        var text = me.text();
        
        if (text.charCodeAt(text.length-1) !== 8230){ // horizontal ellipsis
          return;
        }
        
        if ($TD.expandLinksOnHover){
          var expanded = me.attr("data-full-url");
          expanded = cutStart(expanded,"https://");
          expanded = cutStart(expanded,"http://");
          expanded = cutStart(expanded,"www.");
          
          me.attr("td-prev-text",text);
          me.text(expanded);
        }
        else{
          tooltipTimer = window.setTimeout(function(){
            $TD.displayTooltip(me.attr("data-full-url"),false);
            tooltipDisplayed = true;
          },400);
        }
      }
      else if (e.type === "mouseleave"){
        if ($TD.expandLinksOnHover){
          var prevText = me.attr("td-prev-text");

          if (prevText){
            me.text(prevText);
          }
        }
        
        if (tooltipDisplayed){
          window.clearTimeout(tooltipTimer);
          tooltipDisplayed = false;
          $TD.displayTooltip(null,false);
        }
      }
      else if (e.type === "mousemove"){
        if (tooltipDisplayed && (prevMouseX != e.clientX || prevMouseY != e.clientY)){
          $TD.displayTooltip(me.attr("data-full-url"),false);
          prevMouseX = e.clientX;
          prevMouseY = e.clientY;
        }
      }
    });
  })();
  
  //
  // Block: Allow bypassing of t.co in context menus.
  //
  $(document.body).delegate("a","contextmenu",function(){
    $TD.setLastRightClickedLink($(this).attr("data-full-url") || "");
  });
  
  //
  // Block: Hook into the notification sound effect.
  //
  (function(){
    var soundEle = document.getElementById("update-sound");
    
    soundEle.play = prependToFunction(soundEle.play,function(){
      return $TD.muteNotifications;
    });
  })();
  
  /* TODO document.getElementById("update-sound").play = function(){
    $TD.onTweetSound();
  };*/
  
  //
  // Block: Hook into mp4 video element clicking.
  //
  $(document.body).delegate("video.js-media-gif","click",function(e){
    var src = $(this).attr("src");
    
    if (src.endsWith(".mp4")){
      $TD.openBrowser(src);
      e.preventDefault();
    }
  });
  
  //
  // Block: Update highlighted column
  //
  app.delegate("section","mouseenter mouseleave",function(e){
    if (e.type === "mouseenter"){
      highlightedColumnEle = $(this);
    }
    else if (e.type === "mouseleave"){
      highlightedColumnEle = null;
    }
  });
  
  //
  // Block: Copy tweet address and update highlighted tweet.
  //
  (function(){
    var lastTweet = "";
    
    var updateHighlightedTweet = function(link){
      if (lastTweet != link){
        $TD.setLastHighlightedTweet(link);
        lastTweet = link;
      }
    };
    
    app.delegate("article.js-stream-item","mouseenter mouseleave",function(e){
      if (e.type === "mouseenter"){
        highlightedTweetEle = $(this);
        
        var link = $(this).find("time").first().children("a").first();
        updateHighlightedTweet(link.length > 0 ? link.attr("href") : "");
      }
      else if (e.type === "mouseleave"){
        highlightedTweetEle = null;
        updateHighlightedTweet("");
      }
    });
  })();
  
  //
  // Block: Paste images when tweeting.
  //
  (function(){
    var lastPasteElement;
    var prevScrollTop;
    
    var getScroller = function(){
      return $(".js-drawer").find(".js-compose-scroller").first().children().first();
    };
    
    var clickUpload = function(){
      var button = $(".js-add-image-button").first();
      
      var scroller = getScroller();
      prevScrollTop = scroller.scrollTop();
      
      scroller.scrollTop(0);
      scroller.scrollTop(button.offset().top); // scrolls the button into view
      
      var buttonPos = button.children().first().offset(); // finds the camera icon offset
      $TD.clickUploadImage(Math.floor(buttonPos.left),Math.floor(buttonPos.top));
    };
    
    $(".js-app").delegate(".js-compose-text","paste",function(){
      lastPasteElement = $(this);
      $TD.tryPasteImage();
    });

    window.TDGF_tryPasteImage = function(){
      if (lastPasteElement){
        var parent = lastPasteElement.parent();

        if (parent.siblings(".js-add-image-button").length === 0){
          var pop = parent.closest(".js-inline-reply").find(".js-inline-compose-pop");

          if (pop.length === 0){
            lastPasteElement = null;
            return;
          }
          
          pop.click();
          
          var drawer = $(".js-drawer");
          var counter = 0;
          
          var interval = setInterval(function(){
            if (drawer.offset().left >= 195){
              clickUpload();
              clearInterval(interval);
            }
            else if (++counter >= 10){
              clearInterval(interval);
            }
          },51);
        }
        else{
          clickUpload();
        }
        
        lastPasteElement = null;
      }
    };
    
    window.TDGF_tryPasteImageFinish = function(){
      setTimeout(function(){
        getScroller().scrollTop(prevScrollTop);
        $(".js-drawer").find(".js-compose-text").first()[0].focus();
      },10);
    };
  })();
  
  //
  // Block: Support for extra mouse buttons
  //
  window.TDGF_onMouseClickExtra = function(button){
    if (button === 1){ // back button
      if (highlightedColumnEle && highlightedColumnEle.closest(".js-column").is(".is-shifted-1")){
        highlightedColumnEle.find(".js-column-back").first().click();
      }
      else{
        $(".js-column-back").click();
      }
    }
    else if (button === 2){ // forward button
      if (highlightedTweetEle){
        highlightedTweetEle.children().first().click();
      }
    }
  };
  
  //
  // Block: Inject custom CSS and layout into the page.
  //
  (function(){
    var style = document.createElement("style");
    document.head.appendChild(style);
    var sheet = style.sheet;
    
    // change View Conversation
    var footerLayout = TD.mustaches["status/tweet_single_footer.mustache"];
    footerLayout = footerLayout.replace('txt-mute txt-size--12','txt-mute txt-small');
    footerLayout = footerLayout.replace('{{#inReplyToID}}','{{^inReplyToID}} <a class="pull-left margin-txs txt-mute txt-small is-vishidden-narrow" href="#" rel="viewDetails">{{_i}}Details{{/i}}</a> <a class="pull-left margin-txs txt-mute txt-small is-vishidden is-visshown-narrow" href="#" rel="viewDetails">{{_i}}Open{{/i}}</a> {{/inReplyToID}} {{#inReplyToID}}');
    footerLayout = footerLayout.replace('<span class="link-complex-target"> {{_i}}View Conversation{{/i}}','<i class="icon icon-conversation icon-small-context"></i> <span class="link-complex-target"> <span class="is-vishidden-wide is-vishidden-narrow">{{_i}}View{{/i}}</span> <span class="is-vishidden is-visshown-wide">{{_i}}Conversation{{/i}}</span>');
    TD.mustaches["status/tweet_single_footer.mustache"] = footerLayout;
    
    // tweet actions
    sheet.insertRule(".tweet-actions { float: right !important; width: auto !important; visibility: hidden; }",0);
    sheet.insertRule(".tweet-actions:hover { visibility: visible; }",0);
    sheet.insertRule(".tweet-actions > li:nth-child(4) { margin-right: 2px !important; }",0);
    
    // break long urls
    sheet.insertRule("a[data-full-url] { word-break: break-all; }",0);
  })();
})($,$TD,TD);
