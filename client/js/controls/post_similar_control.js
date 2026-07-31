"use strict";

const events = require("../events.js");
const views = require("../util/views.js");
const settings = require("../models/settings.js");
const api = require("../api.js");
const Post = require("../models/post.js");

const template = views.getTemplate("post-similar");
const itemTemplate = views.getTemplate("post-similar-item");

const PAGE_SIZE = 20;
const PROBE_INTERVAL_MS = 250;

function isScrolledIntoView(element) {
    let top = 0;
    do {
        top += element.offsetTop || 0;
        element = element.offsetParent;
    } while (element);
    return top >= window.scrollY && top <= window.scrollY + window.innerHeight;
}

class PostSimilarControl extends events.EventTarget {
    constructor(hostNode, postId) {
        super();
        this._hostNode = hostNode;
        this._postId = postId;
        this._offset = 0;
        this._loading = false;
        this._reachedEnd = false;
        this._endlessScroll = settings.get().endlessScroll;

        views.replaceContent(
            this._hostNode,
            template({ postFlow: settings.get().postFlow })
        );

        if (this._endlessScroll) {
            this._removeNode(this._loadMoreContainerNode);
            this._probeTimer = window.setInterval(
                () => this._probe(),
                PROBE_INTERVAL_MS
            );
            views.monitorNodeRemoval(this._hostNode, () =>
                window.clearInterval(this._probeTimer)
            );
        } else {
            this._removeNode(this._guardNode);
            this._loadMoreLinkNode.addEventListener("click", (e) => {
                e.preventDefault();
                this._loadNextPage();
            });
        }

        this._loadNextPage();
    }

    get _listNode() {
        return this._hostNode.querySelector("ul");
    }

    get _guardNode() {
        return this._hostNode.querySelector(".similar-guard");
    }

    get _loadMoreContainerNode() {
        return this._hostNode.querySelector(".load-more-container");
    }

    get _loadMoreLinkNode() {
        return this._hostNode.querySelector(".load-more");
    }

    _removeNode(node) {
        if (node && node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    _probe() {
        if (this._loading || this._reachedEnd || !this._guardNode) {
            return;
        }
        if (isScrolledIntoView(this._guardNode)) {
            this._loadNextPage();
        }
    }

    _loadNextPage() {
        if (this._loading || this._reachedEnd) {
            return;
        }
        this._loading = true;
        views.clearMessages(this._hostNode);

        Post.getSimilar(this._postId, this._offset, PAGE_SIZE).then(
            (response) => {
                this._loading = false;
                for (let item of response.results) {
                    this._listNode.appendChild(
                        itemTemplate({
                            post: item.post,
                            distance: item.distance,
                            canViewPosts: api.hasPrivilege("posts:view"),
                        })
                    );
                }
                const isFirstPage = this._offset === 0;
                this._offset += response.results.length;
                if (response.results.length < PAGE_SIZE) {
                    this._reachedEnd = true;
                    this._removeNode(this._loadMoreContainerNode);
                    if (isFirstPage && !response.results.length) {
                        views.showInfo(
                            this._hostNode,
                            "No similar posts found."
                        );
                    }
                }
            },
            (error) => {
                this._loading = false;
                views.showError(this._hostNode, error.message);
            }
        );
    }
}

module.exports = PostSimilarControl;
