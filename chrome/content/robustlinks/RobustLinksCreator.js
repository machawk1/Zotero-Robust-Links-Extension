const getMethods = (obj) => {
    let properties = new Set()
    let currentObj = obj
    do {
      Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
    } while ((currentObj = Object.getPrototypeOf(currentObj)))
    return [...properties.keys()].filter(item => typeof obj[item] === 'function')
  }

Zotero.RobustLinksCreator = {

    /*
     * Indicates whether an item has a 'Robust Link' attachment.
     *
     * @param {Zotero.Item} item: item to be checked.
     *
     * @return {Boolean}: true if item has "archived" tag. Returns false otherwise.
     */

    isArchived : function(item) {
        Zotero.debug("isArchived was called...");

        for(var attid of item.getAttachments()) {
            attachment = Zotero.Items.get(attid);
            if (attachment.getField('title') == 'Robust Link') {
                return true;
            }
        }

        return false;
      },

    /*
     * Ensures that a URL leads to a valid page and uses HTTP/HTTPS.
     *
     * @param {string} url: URL to be checked.
     *
     * returns {Boolean}: True if the URL leads to a resource that uses HTTP/HTTPS,
     *                    False otherwise.
     */

    checkValidUrl : function(url) {
        var pattern = /https?:\/\/.+/;
        var https = pattern.test(url);
        if (!https) {
          return false;
        }
        return true;
      },

    issueNotice: function(notice_title, notice, timeout) {
        var errorNotifWindow =  new Zotero.ProgressWindow({closeOnClick:true});

        errorNotifWindow.changeHeadline(notice_title);
        errorNotifWindow.addLines(notice);
        errorNotifWindow.show();
        errorNotifWindow.startCloseTimer(timeout);
    },

    /*
    * Displays appropriate status window if there is an error, fills in URI-M otherwise.
    * 
    */
    call_robust_link_api: function(url, archive, item, urir_shortcircuit) {
        
        var notice = "";

        if (archive === null ) {
            api_url = "https://robustlinks.mementoweb.org/api/?" + "url=" + encodeURIComponent(url);
        } else {
            api_url = "https://robustlinks.mementoweb.org/api/?" + "archive=" + encodeURIComponent(archive) + "&url=" + encodeURIComponent(url);
        }

        if ( urir_shortcircuit === true ){
            api_url = api_url + '&urir_shortcircuit=True';
        }
        
        var xhr = new XMLHttpRequest();
        // var xhr = new Object();

        // Note: leaving this here for future developers - Zotero does not appear to support onreadystatechange
        // xhr.onreadystatechange = function() {
        //     if (this.readyState == 4 && this.status == 200) {
        //         this.issueNotice("TESTING", "cool things happened here", 50000);
        //         window.alert("We did it, we made onreadystatechange work!");
        //     }
        // };

        xhr.open("GET", api_url, false);
        Zotero.debug("with xhr, sending " + url + " to " + api_url);
        xhr.send();

        Zotero.debug("extracting RL response and responding ourselves appropriately...");

        // xhr.status = 200;

        Zotero.debug("xhr.status is now " + xhr.status);

        notice_duration = 15000;

        switch(xhr.status) {
        case 200:
            notice_title = "Robust Links INFO";
            notice = "Success! Note contains archived link.";

            // for testing...
            // jdata = {
            //     "anchor_text": "ABC News for June 15, 2020",
            //     "api_version": "0.8.1",
            //     "data-originalurl": url,
            //     "data-versiondate": "2020-06-15",
            //     "data-versionurl": "https://archive.li/wip/hWZdd",
            //     "request_url": url,
            //     "request_url_resource_type": "original-resource",
            //     "robust_links_html": {
            //         "memento_url_as_href": "<a href=\"https://archive.li/wip/hWZdd\"\ndata-originalurl=\"https://abcnews.go.com\"\ndata-versiondate=\"2020-06-15\">ABC News for June 15, 2020</a>",
            //         "original_url_as_href": "<a href=\"https://abcnews.go.com\"\ndata-versionurl=\"https://archive.li/wip/hWZdd\"\ndata-versiondate=\"2020-06-15\">ABC News for June 15, 2020</a>"
            //     }
            // };

            jdata = JSON.parse(xhr.responseText);
            Zotero.debug("creating new attachment with " + jdata["data-originalurl"]);
            Zotero.debug("item.id is " + item.id);
            attachments = item.getAttachments();
            Zotero.debug("there are " + attachments.length + " attachments");

            var attachmentPromise = Zotero.Attachments.linkFromURL({
                url: jdata["data-originalurl"],
                parentItemID: item.id,
                title: "Robust Link"
            });

            Zotero.debug("created attachmentPromise...");
            Zotero.debug(attachmentPromise);

            attachmentPromise.then((item) => {

                Zotero.debug("successful creation of attachment with id: " + item.id);              

                notetext = "";
                // It looks like Zotero swallows <link> and <script> elements
                // notetext += '<!-- RobustLinks CSS -->';
                // notetext += '<link rel="stylesheet" type="text/css" href="https://doi.org/10.25776/z58z-r575" />';
                // notetext += '<!-- RobustLinks Javascript -->';
                // notetext += '<script type="text/javascript" src="https://doi.org/10.25776/h1fa-7a28"></script>';
                notetext += "Original URL: " + jdata["robust_links_html"]["original_url_as_href"];
                notetext += "<br>";
                notetext += "Memento URL: " + jdata["robust_links_html"]["memento_url_as_href"];

                item.setNote(notetext);
                item.saveTx();
            },
            (reason) => {
                Zotero.debug("Robust Links failure?");
                Zotero.debug(reason);
            }
            );

            item.saveTx();

            notice_duration = 5000;
            
            break;
        case 400:
            notice_title = "Robust Links ERROR";
            notice = "There was an issue with the value in the URL field.";
            break;
        case 403:
            notice_title = "Robust Links ERROR";
            notice = "Cannot create a memento for the value in the URL field due to legal or policy reasons.";
            break;
        case 404:
        case 405:
            notice_title = "Robust Links ERROR";
            notice = "There is an issue with the Zotero Robust Links Extension. Please contact the extension maintainer.";
            break;
        case 500:
            notice_title = "Robust Links ERROR";
            notice = "There is an issue with the Robust Links service. Please try again later.";
            break;
        case 502:
        case 503:
            notice_title = "Robust Links ERROR";
            notice = "There was an issue creating a memento at " + archive + ". Please try again later.";
            break;
        case 504:
            notice_title = "Robust Links ERROR";
            notice = "The Robust Links service is experiencing issues. Please try again later.";
            break;
        }

        // window.alert(notice);

        Zotero.debug(notice);

        this.issueNotice(notice_title, notice, notice_duration);

    },

    getBestURL: function(item) {
        var url = item.getField('url');

        Zotero.debug("detected url [" + url + "]");

        var doi = item.getField('DOI');

        Zotero.debug("detected doi [" + doi + "]");

        Zotero.debug(doi == '');

        if (doi != "") {
            url = "https://doi.org/" + doi;
        }

        Zotero.debug("using url " + url);

        return url;
    },

    /*
     * Make a Robust Link from an item.
     */
    makeRobustLink : function(archive_name, item, display_status) {

        Zotero.debug("starting makeRobustLink");

        if (item === null) {
            var pane = Zotero.getActiveZoteroPane();
            var selectedItems = pane.getSelectedItems();
            var item = selectedItems[0];
        }

        Zotero.debug("item ID = " + item.id);
        Zotero.debug("item.itemTypeID is " + item.itemTypeID);

        var url = this.getBestURL(item);

        if (item.itemTypeID == 2){
            if ( display_status === true ) {
                notice = "Refusing to archive attachment";
                Zotero.debug(notice);
                this.issueNotice("Robust Links WARNING", notice, 5000);    
            }
            return;
        }

        if ( item.itemTypeID == 26) {
            if ( display_status === true ) {
                notice = "Refusing to archive note";
                Zotero.debug(notice);
                this.issueNotice("Robust Links WARNING", notice, 5000);
            }
            return;
        }

        if (url == "") {
            Zotero.debug("no URL field, returning...");
            if ( display_status === true ) {
                notice = "Refusing to archive blank URL";
                Zotero.debug(notice);
                this.issueNotice("Robust Links WARNING", notice, 5000);
            }
            return;
        }

        if (this.checkValidUrl(url)) {
            if (!this.isArchived(item)) {

                /* this is null rather than 'random' so we can fall through */
                if (archive_name === null ) {
                    notice = "Preserving " + url + " \n at any web archive";
                } else if ( archive_name == 'default' ) {
                    archive_name = Zotero.Prefs.get('extensions.robustlinks.whatarchive', true);

                    if ( archive_name == "random" ) {
                        archive_name = null;
                    }
                    notice = "Preserving " + url + " \n at web archive " + archive_name;
                } else {
                    notice = "Preserving " + url + " \n at web archive " + archive_name;
                }
                Zotero.debug(notice);
                
                this.issueNotice("Robust Links INFO", notice, 5000);

                always_assume_urir = Zotero.Prefs.get('extensions.robustlinks.alwaysurir', true);

                Zotero.debug("extensions.robustlinks.alwaysurir is " + always_assume_urir);

                if ( url.includes("doi.org") || ( always_assume_urir === "yes" ) ) {
                    this.call_robust_link_api(url, archive_name, item, true);
                } else {
                    this.call_robust_link_api(url, archive_name, item, false);
                }

            } else {

                notice = "Already preserved at a web archive";
                Zotero.debug(notice);
                this.issueNotice("Robust Links INFO", notice, 5000);
            }
        } else {
            notice = "Refusing to preserve invalid URL " + url;
            Zotero.debug(notice);
            this.issueNotice("Robust Links WARNING", notice, 5000);
        }

    },

}