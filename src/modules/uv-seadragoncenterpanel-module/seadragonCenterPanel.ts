/// <reference path="../../js/jquery.d.ts" />
/// <reference path="../../js/extensions.d.ts" />

import baseExtension = require("../uv-shared-module/baseExtension");
import baseProvider = require("../uv-shared-module/baseProvider");
import extension = require("../../extensions/uv-seadragon-extension/extension");
import baseCenter = require("../uv-shared-module/centerPanel");
import ISeadragonProvider = require("../../extensions/uv-seadragon-extension/iSeadragonProvider");
import utils = require("../../utils");

export class SeadragonCenterPanel extends baseCenter.CenterPanel {

    lastTilesNum: number;
    tileSources: any[];
    userData: any;
    handler: any;
    prevButtonEnabled: boolean = false;
    nextButtonEnabled: boolean = false;
    initialBounds: any;
    initialRotation: any;
    viewer: any;
    title: string;
    currentBounds: any;
    isFirstLoad: boolean = true;
    isLoading: boolean = false;
    controlsVisible: boolean = false;
    isCreated: boolean = false;

    $viewer: JQuery;
    $spinner: JQuery;
    $rights: JQuery;
    $closeRightsBtn: JQuery;
    $prevButton: JQuery;
    $nextButton: JQuery;
    $zoomInButton: JQuery;
    $zoomOutButton: JQuery;
    $goHomeButton: JQuery;
    $rotateButton: JQuery;

    // events
    static SEADRAGON_OPEN: string = 'center.onOpen';
    static SEADRAGON_RESIZE: string = 'center.onResize';
    static SEADRAGON_ANIMATION_START: string = 'center.onAnimationStart';
    static SEADRAGON_ANIMATION: string = 'center.onAnimation';
    static SEADRAGON_ANIMATION_FINISH: string = 'center.onAnimationfinish';
    static SEADRAGON_ROTATION: string = 'center.onRotation';
    static PREV: string = 'center.onPrev';
    static NEXT: string = 'center.onNext';

    constructor($element: JQuery) {
        super($element);
    }

    create(): void {

        this.setConfig('seadragonCenterPanel');

        super.create();

        this.$viewer = $('<div id="viewer"></div>');
        this.$content.append(this.$viewer);

        // events

        $.subscribe(baseExtension.BaseExtension.OPEN_MEDIA, () => {
            this.tryLoad();
        });
    }

    // delay viewer creation to ensure it happens after initial resize
    // todo: implement a listener for an onResized event
    tryLoad(): void {
        if (this.isLoading) return;
        if (!this.isCreated) {
            setTimeout(() => {
                this.createUI();
                this.loadTileSources();
            }, 1000);
        } else {
            this.loadTileSources();
        }
    }

    createUI(): void {
        this.$spinner = $('<div class="spinner"></div>');
        this.$content.append(this.$spinner);

        this.$rights = $('<div class="rights">\
                               <div class="header">\
                                   <div class="title"></div>\
                                   <div class="close"></div>\
                               </div>\
                               <div class="main">\
                                   <div class="attribution"></div>\
                                   <div class="license"></div>\
                                   <div class="logo"></div>\
                               </div>\
                          </div>');

        this.$rights.find('.header .title').text(this.content.acknowledgements);
        this.$content.append(this.$rights);

        this.$closeRightsBtn = this.$rights.find('.header .close');
        this.$closeRightsBtn.on('click', (e) => {
            e.preventDefault();
            this.$rights.hide();
        });

        // todo: use compiler flag (when available)
        var prefixUrl = (window.DEBUG)? 'modules/uv-seadragoncenterpanel-module/img/' : 'themes/' + this.provider.config.options.theme + '/img/uv-seadragoncenterpanel-module/';

        // add to window object for testing automation purposes.
        window.openSeadragonViewer = this.viewer = OpenSeadragon({
            id: "viewer",
            showNavigationControl: true,
            showNavigator: true,
            showRotationControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            defaultZoomLevel: this.config.options.defaultZoomLevel || 0,
            controlsFadeDelay: this.config.options.controlsFadeDelay,
            controlsFadeLength: this.config.options.controlsFadeLength,
            navigatorPosition: this.config.options.navigatorPosition,
            prefixUrl: prefixUrl,
            navImages: {
                zoomIn: {
                    REST:   'zoom_in.png',
                    GROUP:  'zoom_in.png',
                    HOVER:  'zoom_in.png',
                    DOWN:   'zoom_in.png'
                },
                zoomOut: {
                    REST:   'zoom_out.png',
                    GROUP:  'zoom_out.png',
                    HOVER:  'zoom_out.png',
                    DOWN:   'zoom_out.png'
                },
                home: {
                    REST:   'home.png',
                    GROUP:  'home.png',
                    HOVER:  'home.png',
                    DOWN:   'home.png'
                },
                rotateright: {
                    REST:   'rotate_right.png',
                    GROUP:  'rotate_right.png',
                    HOVER:  'rotate_right.png',
                    DOWN:   'rotate_right.png'
                },
                rotateleft: {
                    REST:   'pixel.gif',
                    GROUP:  'pixel.gif',
                    HOVER:  'pixel.gif',
                    DOWN:   'pixel.gif'
                },
                next: {
                    REST:   'pixel.gif',
                    GROUP:  'pixel.gif',
                    HOVER:  'pixel.gif',
                    DOWN:   'pixel.gif'
                },
                previous: {
                    REST:   'pixel.gif',
                    GROUP:  'pixel.gif',
                    HOVER:  'pixel.gif',
                    DOWN:   'pixel.gif'
                }
            }
        });

        this.$zoomInButton = this.$viewer.find('div[title="Zoom in"]');
        this.$zoomInButton.attr('tabindex', 11);
        this.$zoomInButton.addClass('zoomIn');

        this.$zoomOutButton = this.$viewer.find('div[title="Zoom out"]');
        this.$zoomOutButton.attr('tabindex', 12);
        this.$zoomOutButton.addClass('zoomOut');

        this.$goHomeButton = this.$viewer.find('div[title="Go home"]');
        this.$goHomeButton.attr('tabindex', 13);
        this.$goHomeButton.addClass('goHome');

        this.$rotateButton = this.$viewer.find('div[title="Rotate right"]');
        this.$rotateButton.attr('tabindex', 14);
        this.$rotateButton.addClass('rotate');

        // events

        this.$element.on('mousemove', (e) => {
            if (this.controlsVisible) return;
            this.controlsVisible = true;
            this.viewer.setControlsEnabled(true);
        });

        this.$element.on('mouseleave', (e) => {
            if (!this.controlsVisible) return;
            this.controlsVisible = false;
            this.viewer.setControlsEnabled(false);
        });

        // when mouse move stopped
        this.$element.on('mousemove', (e) => {
            // if over element, hide controls.
            if (!this.$viewer.find('.navigator').ismouseover()){
                if (!this.controlsVisible) return;
                this.controlsVisible = false;
                this.viewer.setControlsEnabled(false);
            }
        }, this.config.options.controlsFadeAfterInactive);

        this.viewer.addHandler('open', (viewer) => {
            $.publish(SeadragonCenterPanel.SEADRAGON_OPEN, [viewer]);
            this.openTileSourcesHandler();
        });

        //this.viewer.addHandler("open-failed", () => {
        //});

        this.viewer.addHandler('resize', (viewer) => {
            $.publish(SeadragonCenterPanel.SEADRAGON_RESIZE, [viewer]);
            this.viewerResize(viewer);
        });

        this.viewer.addHandler('animation-start', (viewer) => {
            $.publish(SeadragonCenterPanel.SEADRAGON_ANIMATION_START, [viewer]);
        });

        this.viewer.addHandler('animation', (viewer) => {
            $.publish(SeadragonCenterPanel.SEADRAGON_ANIMATION, [viewer]);
        });

        this.viewer.addHandler('animation-finish', (viewer) => {
            this.currentBounds = this.getBounds();

            $.publish(SeadragonCenterPanel.SEADRAGON_ANIMATION_FINISH, [viewer]);
        });

        this.$rotateButton.on('click', () => {
            $.publish(SeadragonCenterPanel.SEADRAGON_ROTATION, [this.viewer.viewport.getRotation()]);
        });

        this.title = this.extension.provider.getTitle();

        this.createNavigationButtons();

        // if firefox, hide rotation and prev/next until this is resolved
        //var browser = window.browserDetect.browser;

        //if (browser == 'Firefox') {
        //    if (this.provider.isMultiCanvas()){
        //        this.$prevButton.hide();
        //        this.$nextButton.hide();
        //    }
        //    this.$rotateButton.hide();
        //}

        this.showAttribution();

        this.isCreated = true;

        this.resize();
    }

    createNavigationButtons() {
        if (!this.provider.isMultiCanvas()) return;

        this.$prevButton = $('<div class="paging btn prev"></div>');
        this.$prevButton.prop('title', this.content.previous);
        this.viewer.addControl(this.$prevButton[0], {anchor: OpenSeadragon.ControlAnchor.TOP_LEFT});

        this.$nextButton = $('<div class="paging btn next"></div>');
        this.$nextButton.prop('title', this.content.next);
        this.viewer.addControl(this.$nextButton[0], {anchor: OpenSeadragon.ControlAnchor.TOP_RIGHT});

        var that = this;

        this.$prevButton.on('touchstart click', (e) => {
            e.preventDefault();
            OpenSeadragon.cancelEvent(e);

            if (!that.prevButtonEnabled) return;

            $.publish(SeadragonCenterPanel.PREV);
        });

        this.$nextButton.on('touchstart click', (e) => {
            e.preventDefault();
            OpenSeadragon.cancelEvent(e);

            if (!that.nextButtonEnabled) return;

            $.publish(SeadragonCenterPanel.NEXT);
        });
    }

    loadTileSources(): void {

        this.isLoading = true;

        this.tileSources = this.provider.getTileSources();

        this.$spinner.show();

        // todo: use compiler flag (when available)
        var imageUnavailableUri = (window.DEBUG)? '/src/extensions/uv-seadragon-extension/js/imageunavailable.js' : 'js/imageunavailable.js';

        _.each(this.tileSources, function(ts) {
            if (!ts.tileSource){
                ts.tileSource = imageUnavailableUri
            }
        });

        //this.viewer.addHandler('open', this.openTileSourcesHandler, this);
        //this.viewer.world.resetItems();
        this.viewer.open(this.tileSources[0]);
    }

    openTileSourcesHandler() {

        var viewingDirection = this.provider.getViewingDirection();

        // if there's more than one tilesource, align them next to each other.
        if (this.tileSources.length > 1) {

            // check if tilesources should be aligned horizontally or vertically
            if (viewingDirection == "top-to-bottom" || viewingDirection == "bottom-to-top") {
                // vertical
                this.tileSources[1].y = this.viewer.world.getItemAt(0).getBounds().y + this.viewer.world.getItemAt(0).getBounds().height + this.config.options.pageGap;
            } else {
                // horizontal
                this.tileSources[1].x = this.viewer.world.getItemAt(0).getBounds().x + this.viewer.world.getItemAt(0).getBounds().width + this.config.options.pageGap;
            }

            this.viewer.addTiledImage(this.tileSources[1]);
        }

        // check for initial zoom/rotation params.
        if (this.isFirstLoad){

            this.initialRotation = this.extension.getParam(baseProvider.params.rotation);

            if (this.initialRotation){
                this.viewer.viewport.setRotation(parseInt(this.initialRotation));
            }

            this.initialBounds = this.extension.getParam(baseProvider.params.zoom);

            if (this.initialBounds){
                this.initialBounds = this.deserialiseBounds(this.initialBounds);
                this.currentBounds = this.initialBounds;
                this.fitToBounds(this.currentBounds);
            }
        } else {
            // it's not the first load
            var settings: ISettings = this.provider.getSettings();

            // zoom to bounds unless setting disabled
            if (settings.preserveViewport){
                this.fitToBounds(this.currentBounds);
            } else {
                this.goHome();
            }
        }

        if (this.provider.isMultiCanvas()) {

            $('.navigator').addClass('extraMargin');

            if (!this.provider.isFirstCanvas()) {
                this.enablePrevButton();
            } else {
                this.disablePrevButton();
            }

            if (!this.provider.isLastCanvas()) {
                this.enableNextButton();
            } else {
                this.disableNextButton();
            }
        }

        this.lastTilesNum = this.tileSources.length;
        this.isFirstLoad = false;
        this.isLoading = false;
        this.$spinner.hide();
    }

    showAttribution(): void {
        var attribution = this.provider.getAttribution();
        //var license = this.provider.getLicense();
        //var logo = this.provider.getLogo();

        if (!attribution){
            this.$rights.hide();
            return;
        }

        var $attribution = this.$rights.find('.attribution');
        var $license = this.$rights.find('.license');
        var $logo = this.$rights.find('.logo');

        if (attribution){
            $attribution.html(this.provider.sanitize(attribution));
            $attribution.find('img').one("load", () => {
                this.resize();
            }).each(function() {
                if(this.complete) $(this).load();
            });
            $attribution.targetBlank();
            $attribution.toggleExpandText(this.options.trimAttributionCount, () => {
                this.resize();
            });
        } else {
            $attribution.hide();
        }

        //if (license){
        //    $license.append('<a href="' + license + '">' + license + '</a>');
        //} else {
        $license.hide();
        //}
        //
        //if (logo){
        //    $logo.append('<img src="' + logo + '"/>');
        //} else {
        $logo.hide();
        //}
    }

    goHome(): void {
        var viewingDirection = this.provider.getViewingDirection();

        switch (viewingDirection){
            case "top-to-bottom" :
                this.viewer.viewport.fitBounds(new OpenSeadragon.Rect(0, 0, 1, this.viewer.world.getItemAt(0).normHeight * this.tileSources.length), true);
                break;
            case "left-to-right" :
            case "right-to-left" :
                this.viewer.viewport.fitBounds(new OpenSeadragon.Rect(0, 0, this.tileSources.length, this.viewer.world.getItemAt(0).normHeight), true);
                break;
        }
    }

    disablePrevButton () {
        this.prevButtonEnabled = false;
        this.$prevButton.addClass('disabled');
    }

    enablePrevButton () {
        this.prevButtonEnabled = true;
        this.$prevButton.removeClass('disabled');
    }

    disableNextButton () {
        this.nextButtonEnabled = false;
        this.$nextButton.addClass('disabled');
    }

    enableNextButton () {
        this.nextButtonEnabled = true;
        this.$nextButton.removeClass('disabled');
    }

    serialiseBounds(bounds): string{
        return bounds.x + ',' + bounds.y + ',' + bounds.width + ',' + bounds.height;
    }

    deserialiseBounds(bounds: string): any {

        var boundsArr = bounds.split(',');

        return {
            x: Number(boundsArr[0]),
            y: Number(boundsArr[1]),
            width: Number(boundsArr[2]),
            height: Number(boundsArr[3])
        };
    }

    fitToBounds(bounds): void {
        var rect = new OpenSeadragon.Rect();
        rect.x = bounds.x;
        rect.y = bounds.y;
        rect.width = bounds.width;
        rect.height = bounds.height;

        this.viewer.viewport.fitBounds(rect, true);
    }

    getBounds(): any {

        if (!this.viewer || !this.viewer.viewport) return null;

        var bounds = this.viewer.viewport.getBounds(true);

        return {
            x: utils.Utils.roundNumber(bounds.x, 4),
            y: utils.Utils.roundNumber(bounds.y, 4),
            width: utils.Utils.roundNumber(bounds.width, 4),
            height: utils.Utils.roundNumber(bounds.height, 4)
        };
    }

    viewerResize(viewer: any): void {

        if (!viewer.viewport) return;

        var center = viewer.viewport.getCenter(true);
        if (!center) return;

        // postpone pan for a millisecond - fixes iPad image stretching/squashing issue.
        setTimeout(function () {
            viewer.viewport.panTo(center, true);
        }, 1);
    }

    resize(): void {
        super.resize();

        this.$viewer.height(this.$content.height() - this.$viewer.verticalMargins());
        this.$viewer.width(this.$content.width() - this.$viewer.horizontalMargins());

        if (!this.isCreated) return;

        if (this.currentBounds) {
            this.fitToBounds(this.currentBounds);
        }

        this.$title.ellipsisFill(this.title);

        this.$spinner.css('top', (this.$content.height() / 2) - (this.$spinner.height() / 2));
        this.$spinner.css('left', (this.$content.width() / 2) - (this.$spinner.width() / 2));

        if (this.provider.isMultiCanvas() && this.$prevButton && this.$nextButton) {
            this.$prevButton.css('top', (this.$content.height() - this.$prevButton.height()) / 2);
            this.$nextButton.css('top', (this.$content.height() - this.$nextButton.height()) / 2);
        }

        if (this.$rights && this.$rights.is(':visible')){
            this.$rights.css('top', this.$content.height() - this.$rights.outerHeight() - this.$rights.verticalMargins());
        }
    }
}