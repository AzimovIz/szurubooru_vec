"use strict";

const iosCorrectedInnerHeight = require("ios-inner-height");
const router = require("../router.js");
const views = require("../util/views.js");
const uri = require("../util/uri.js");
const keyboard = require("../util/keyboard.js");
const Touch = require("../util/touch.js");
const PostContentControl = require("../controls/post_content_control.js");
const PostNotesOverlayControl = require("../controls/post_notes_overlay_control.js");
const PostReadonlySidebarControl = require("../controls/post_readonly_sidebar_control.js");
const PostEditSidebarControl = require("../controls/post_edit_sidebar_control.js");
const CommentControl = require("../controls/comment_control.js");
const CommentListControl = require("../controls/comment_list_control.js");
const PostSimilarControl = require("../controls/post_similar_control.js");

const template = views.getTemplate("post-main");

class PostMainView {
    constructor(ctx) {
        this._hostNode = document.getElementById("content-holder");

        const sourceNode = template(ctx);
        const postContainerNode = sourceNode.querySelector(".post-container");
        const sidebarNode = sourceNode.querySelector(".sidebar");
        views.replaceContent(this._hostNode, sourceNode);
        views.syncScrollPosition();

        const topNavigationNode =
            document.body.querySelector("#top-navigation");

        this._postContentControl = new PostContentControl(
            postContainerNode,
            ctx.post,
            () => {
                const margin = sidebarNode.getBoundingClientRect().left;

                return [
                    window.innerWidth -
                        postContainerNode.getBoundingClientRect().left -
                        margin,
                    iosCorrectedInnerHeight() -
                        topNavigationNode.getBoundingClientRect().height -
                        margin * 2,
                ];
            }
        );

        this._postNotesOverlayControl = new PostNotesOverlayControl(
            postContainerNode.querySelector(".post-overlay"),
            ctx.post
        );

        if (ctx.post.type === "video" || ctx.post.type === "flash") {
            this._postContentControl.disableOverlay();
        }

        this._installSidebar(ctx);
        this._installCommentForm();
        this._installComments(ctx.post.comments);
        this._installTabs(ctx);

        const showPreviousImage = () => {
            if (ctx.prevPostId) {
                if (ctx.editMode) {
                    router.show(
                        ctx.getPostEditUrl(ctx.prevPostId, ctx.parameters)
                    );
                } else {
                    router.show(
                        ctx.getPostUrl(ctx.prevPostId, ctx.parameters)
                    );
                }
            }
        };

        const showNextImage = () => {
            if (ctx.nextPostId) {
                if (ctx.editMode) {
                    router.show(
                        ctx.getPostEditUrl(ctx.nextPostId, ctx.parameters)
                    );
                } else {
                    router.show(
                        ctx.getPostUrl(ctx.nextPostId, ctx.parameters)
                    );
                }
            }
        };

        keyboard.bind("e", () => {
            if (ctx.editMode) {
                router.show(uri.formatClientLink("post", ctx.post.id));
            } else {
                router.show(uri.formatClientLink("post", ctx.post.id, "edit"));
            }
        });
        keyboard.bind(["a", "left"], showPreviousImage);
        keyboard.bind(["d", "right"], showNextImage);
        keyboard.bind("del", (e) => {
            if (ctx.editMode) {
                this.sidebarControl._evtDeleteClick(e);
            }
        });

        new Touch(
            postContainerNode,
            () => {
                if (!ctx.editMode) {
                    showPreviousImage();
                }
            },
            () => {
                if (!ctx.editMode) {
                    showNextImage();
                }
            }
        );
    }

    _installSidebar(ctx) {
        const sidebarContainerNode = document.querySelector(
            "#content-holder .sidebar-container"
        );

        if (ctx.editMode) {
            this.sidebarControl = new PostEditSidebarControl(
                sidebarContainerNode,
                ctx.post,
                this._postContentControl,
                this._postNotesOverlayControl
            );
        } else {
            this.sidebarControl = new PostReadonlySidebarControl(
                sidebarContainerNode,
                ctx.post,
                this._postContentControl
            );
        }
    }

    _installCommentForm() {
        const commentFormContainer = document.querySelector(
            "#content-holder .comment-form-container"
        );
        if (!commentFormContainer) {
            return;
        }

        this.commentControl = new CommentControl(
            commentFormContainer,
            null,
            true
        );
    }

    _installComments(comments) {
        const commentsContainerNode = document.querySelector(
            "#content-holder .comments-container"
        );
        if (!commentsContainerNode) {
            return;
        }

        this.commentListControl = new CommentListControl(
            commentsContainerNode,
            comments
        );
    }

    _installTabs(ctx) {
        const tabButtonNodes = document.querySelectorAll(
            "#content-holder .tab-buttons .tab-button"
        );
        if (!tabButtonNodes.length) {
            return;
        }

        for (let tabButtonNode of tabButtonNodes) {
            tabButtonNode.addEventListener("click", (e) => {
                e.preventDefault();
                this._activateTab(ctx, tabButtonNode.getAttribute("data-tab"));
            });
        }
    }

    _activateTab(ctx, tabName) {
        const tabButtonNodes = document.querySelectorAll(
            "#content-holder .tab-buttons .tab-button"
        );
        const tabPanelNodes = document.querySelectorAll(
            "#content-holder .tab-panel"
        );
        for (let node of tabButtonNodes) {
            node.classList.toggle(
                "active",
                node.getAttribute("data-tab") === tabName
            );
        }
        for (let node of tabPanelNodes) {
            node.classList.toggle(
                "active",
                node.classList.contains(tabName + "-panel")
            );
        }

        if (tabName === "similar" && !this._postSimilarControl) {
            const similarContainerNode = document.querySelector(
                "#content-holder .similar-container"
            );
            if (similarContainerNode) {
                this._postSimilarControl = new PostSimilarControl(
                    similarContainerNode,
                    ctx.post.id
                );
            }
        }
    }
}

module.exports = PostMainView;
