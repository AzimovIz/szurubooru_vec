"use strict";

const events = require("../events.js");
const api = require("../api.js");
const views = require("../util/views.js");
const FileDropperControl = require("../controls/file_dropper_control.js");

const template = views.getTemplate("post-upload");
const rowTemplate = views.getTemplate("post-upload-row");

const RATING_TO_SAFETY = {
    "rating:safe": "safe",
    "rating:questionable": "sketchy",
    "rating:explicit": "unsafe",
};

function _mimeTypeToPostType(mimeType) {
    return (
        {
            "application/x-shockwave-flash": "flash",
            "image/gif": "image",
            "image/jpeg": "image",
            "image/png": "image",
            "image/webp": "image",
            "image/bmp": "image",
            "image/avif": "image",
            "image/heif": "image",
            "image/heic": "image",
            "video/mp4": "video",
            "video/webm": "video",
            "video/quicktime": "video",
        }[mimeType] || "unknown"
    );
}

class Uploadable extends events.EventTarget {
    constructor() {
        super();
        this.lookalikes = [];
        this.lookalikesConfirmed = false;
        this.safety = "safe";
        this.flags = [];
        this.tags = [];
        this.relations = [];
        this.anonymous = !api.isLoggedIn();
        this.forceAnonymous = !api.isLoggedIn();
    }

    destroy() {}

    get mimeType() {
        return "application/octet-stream";
    }

    get type() {
        return _mimeTypeToPostType(this.mimeType);
    }

    get key() {
        throw new Error("Not implemented");
    }

    get name() {
        throw new Error("Not implemented");
    }
}

class File extends Uploadable {
    constructor(file) {
        super();
        this.file = file;

        this._previewUrl = null;
        if (URL && URL.createObjectURL) {
            this._previewUrl = URL.createObjectURL(file);
        } else {
            let reader = new FileReader();
            reader.readAsDataURL(file);
            reader.addEventListener("load", (e) => {
                this._previewUrl = e.target.result;
                this.dispatchEvent(
                    new CustomEvent("finish", { detail: { uploadable: this } })
                );
            });
        }
    }

    destroy() {
        if (URL && URL.createObjectURL && URL.revokeObjectURL) {
            URL.revokeObjectURL(this._previewUrl);
        }
    }

    get mimeType() {
        return this.file.type;
    }

    get previewUrl() {
        return this._previewUrl;
    }

    get key() {
        return this.file.name + this.file.size;
    }

    get name() {
        return this.file.name;
    }
}

class Url extends Uploadable {
    constructor(url) {
        super();
        this.url = url;
        this.dispatchEvent(new CustomEvent("finish"));
    }

    get mimeType() {
        let mime = {
            swf: "application/x-shockwave-flash",
            jpg: "image/jpeg",
            png: "image/png",
            gif: "image/gif",
            webp: "image/webp",
            bmp: "image/bmp",
            avif: "image/avif",
            heif: "image/heif",
            heic: "image/heic",
            mp4: "video/mp4",
            mov: "video/quicktime",
            webm: "video/webm",
        };
        for (let extension of Object.keys(mime)) {
            if (this.url.toLowerCase().indexOf("." + extension) !== -1) {
                return mime[extension];
            }
        }
        return "unknown";
    }

    get previewUrl() {
        return this.url;
    }

    get key() {
        return this.url;
    }

    get name() {
        return this.url;
    }
}

class PostUploadView extends events.EventTarget {
    constructor(ctx) {
        super();
        this._ctx = ctx;
        this._hostNode = document.getElementById("content-holder");

        views.replaceContent(this._hostNode, template());
        views.syncScrollPosition();

        this._cancelButtonNode.disabled = true;

        this._uploadables = [];
        this._uploadables.find = (u) => {
            return this._uploadables.findIndex((u2) => u.key === u2.key);
        };

        this._contentFileDropper = new FileDropperControl(
            this._contentInputNode,
            {
                extraText:
                    "Allowed extensions: .jpg, .png, .gif, .webm, .mp4, .swf, .avif, .heif, .heic",
                allowUrls: true,
                allowMultiple: true,
                lock: false,
            }
        );
        this._contentFileDropper.addEventListener("fileadd", (e) =>
            this._evtFilesAdded(e)
        );
        this._contentFileDropper.addEventListener("urladd", (e) =>
            this._evtUrlsAdded(e)
        );

        this._cancelButtonNode.addEventListener("click", (e) =>
            this._evtCancelButtonClick(e)
        );
        this._formNode.addEventListener("submit", (e) =>
            this._evtFormSubmit(e)
        );
        this._autotaggingCheckboxNode.addEventListener("change", (e) =>
            this._evtAutotaggingChange(e)
        );
        this._formNode.classList.add("inactive");
    }

    enableForm() {
        views.enableForm(this._formNode);
        this._cancelButtonNode.disabled = true;
        this._formNode.classList.remove("uploading");
    }

    disableForm() {
        views.disableForm(this._formNode);
        this._cancelButtonNode.disabled = false;
        this._formNode.classList.add("uploading");
    }

    clearMessages() {
        views.clearMessages(this._hostNode);
    }

    showSuccess(message) {
        views.showSuccess(this._hostNode, message);
    }

    showError(message, uploadable) {
        this._showMessage(views.showError, message, uploadable);
    }

    showInfo(message, uploadable) {
        this._showMessage(views.showInfo, message, uploadable);
        views.appendExclamationMark();
    }

    _showMessage(functor, message, uploadable) {
        functor(uploadable ? uploadable.rowNode : this._hostNode, message);
    }

    addUploadables(uploadables) {
        this._formNode.classList.remove("inactive");
        let duplicatesFound = 0;
        for (let uploadable of uploadables) {
            if (this._uploadables.find(uploadable) !== -1) {
                duplicatesFound++;
                continue;
            }
            this._uploadables.push(uploadable);
            this._emit("change");
            this._renderRowNode(uploadable);
            uploadable.addEventListener("finish", (e) =>
                this._updateThumbnailNode(e.detail.uploadable)
            );
            if (this._autotaggingCheckboxNode.checked) {
                this._autotagUploadable(uploadable);
            }
        }
        if (duplicatesFound) {
            let message = null;
            if (duplicatesFound < uploadables.length) {
                message =
                    "Some of the files were already added " +
                    "and have been skipped.";
            } else if (duplicatesFound === 1) {
                message = "This file was already added.";
            } else {
                message = "These files were already added.";
            }
            alert(message);
        }
    }

    removeUploadable(uploadable) {
        if (this._uploadables.find(uploadable) === -1) {
            return;
        }
        uploadable.destroy();
        uploadable.rowNode.parentNode.removeChild(uploadable.rowNode);
        this._uploadables.splice(this._uploadables.find(uploadable), 1);
        this._emit("change");
        if (!this._uploadables.length) {
            this._formNode.classList.add("inactive");
            this._submitButtonNode.value = "Upload all";
        }
    }

    updateUploadable(uploadable) {
        uploadable.lookalikesConfirmed = true;
        // re-rendering the row replaces its DOM, so anything the user
        // already typed into the tags field has to be carried over first
        this._syncTagsFromDom(uploadable);
        this._renderRowNode(uploadable);
    }

    _evtFilesAdded(e) {
        this.addUploadables(e.detail.files.map((file) => new File(file)));
    }

    _evtUrlsAdded(e) {
        this.addUploadables(e.detail.urls.map((url) => new Url(url)));
    }

    _evtAutotaggingChange(e) {
        if (!e.target.checked) {
            return;
        }
        for (let uploadable of this._uploadables) {
            this._autotagUploadable(uploadable);
        }
    }

    _syncTagsFromDom(uploadable) {
        if (!uploadable.rowNode) {
            return;
        }
        const tagsInputNode = uploadable.rowNode.querySelector(
            ".tags [name=tags]"
        );
        if (tagsInputNode) {
            uploadable.tags = tagsInputNode.value
                .split(/\s+/)
                .filter((tagName) => tagName);
        }
    }

    _autotagUploadable(uploadable) {
        if (uploadable.autotagRequested) {
            return;
        }

        let request;
        if (uploadable instanceof File) {
            const formData = new FormData();
            formData.append("file", uploadable.file);
            request = fetch("/tagging", { method: "POST", body: formData });
        } else if (uploadable instanceof Url) {
            // no local bytes for URL-based uploads - the embedder downloads
            // the URL itself (racing a few identities in parallel, since
            // some sites are picky/flaky about who's asking)
            request = fetch("/tag-by-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: uploadable.url }),
            });
        } else {
            return;
        }
        uploadable.autotagRequested = true;

        const rowNode = uploadable.rowNode;
        request
            .then((response) => response.json())
            .then((data) => {
                if (data.error) {
                    throw new Error(data.error);
                }
                this._applyAutotagResults(rowNode, data.tags || []);
            })
            .catch((error) => {
                this.showError(
                    "Autotagging failed: " + error.message,
                    uploadable
                );
            });
    }

    _applyAutotagResults(rowNode, tags) {
        const regularTags = [];
        let safety = null;
        for (let tag of tags) {
            if (RATING_TO_SAFETY[tag]) {
                safety = RATING_TO_SAFETY[tag];
            } else {
                regularTags.push(tag);
            }
        }

        if (safety) {
            const safetyNode = rowNode.querySelector(
                `.safety input[value=${safety}]`
            );
            if (safetyNode) {
                safetyNode.checked = true;
            }
        }

        const tagsInputNode = rowNode.querySelector(".tags [name=tags]");
        if (tagsInputNode && regularTags.length) {
            const existingTags = tagsInputNode.value
                .split(/\s+/)
                .filter((tagName) => tagName);
            const mergedTags = existingTags.concat(
                regularTags.filter((tagName) => !existingTags.includes(tagName))
            );
            tagsInputNode.value = mergedTags.join(" ");
        }
    }

    _evtCancelButtonClick(e) {
        e.preventDefault();
        this._emit("cancel");
    }

    _evtFormSubmit(e) {
        e.preventDefault();
        for (let uploadable of this._uploadables) {
            this._updateUploadableFromDom(uploadable);
        }
        this._submitButtonNode.value = "Resume";
        this._emit("submit");
    }

    _updateUploadableFromDom(uploadable) {
        const rowNode = uploadable.rowNode;

        const safetyNode = rowNode.querySelector(".safety input:checked");
        if (safetyNode) {
            uploadable.safety = safetyNode.value;
        }

        const anonymousNode = rowNode.querySelector(
            ".anonymous input:checked"
        );
        if (anonymousNode) {
            uploadable.anonymous = true;
        }

        this._syncTagsFromDom(uploadable);
        uploadable.relations = [];
        for (let [i, lookalike] of uploadable.lookalikes.entries()) {
            let lookalikeNode = rowNode.querySelector(
                `.lookalikes li:nth-child(${i + 1})`
            );
            if (lookalikeNode.querySelector("[name=copy-tags]").checked) {
                uploadable.tags = uploadable.tags.concat(
                    lookalike.post.tagNames.filter(
                        (tagName) => !uploadable.tags.includes(tagName)
                    )
                );
            }
            if (lookalikeNode.querySelector("[name=add-relation]").checked) {
                uploadable.relations.push(lookalike.post.id);
            }
        }
    }

    _evtRemoveClick(e, uploadable) {
        e.preventDefault();
        if (this._uploading) {
            return;
        }
        this.removeUploadable(uploadable);
    }

    _evtMoveClick(e, uploadable, delta) {
        e.preventDefault();
        if (this._uploading) {
            return;
        }
        let index = this._uploadables.find(uploadable);
        if ((index + delta).between(-1, this._uploadables.length)) {
            let uploadable1 = this._uploadables[index];
            let uploadable2 = this._uploadables[index + delta];
            this._uploadables[index] = uploadable2;
            this._uploadables[index + delta] = uploadable1;
            if (delta === 1) {
                this._listNode.insertBefore(
                    uploadable2.rowNode,
                    uploadable1.rowNode
                );
            } else {
                this._listNode.insertBefore(
                    uploadable1.rowNode,
                    uploadable2.rowNode
                );
            }
        }
    }

    _emit(eventType) {
        this.dispatchEvent(
            new CustomEvent(eventType, {
                detail: {
                    uploadables: this._uploadables,
                    skipDuplicates: this._skipDuplicatesCheckboxNode.checked,
                    alwaysUploadSimilar:
                        this._alwaysUploadSimilarCheckboxNode.checked,
                    pauseRemainOnError:
                        this._pauseRemainOnErrorCheckboxNode.checked,
                },
            })
        );
    }

    _renderRowNode(uploadable) {
        const rowNode = rowTemplate(
            Object.assign({}, this._ctx, { uploadable: uploadable })
        );
        if (uploadable.rowNode) {
            uploadable.rowNode.parentNode.replaceChild(
                rowNode,
                uploadable.rowNode
            );
        } else {
            this._listNode.appendChild(rowNode);
        }

        uploadable.rowNode = rowNode;

        rowNode
            .querySelector("a.remove")
            .addEventListener("click", (e) =>
                this._evtRemoveClick(e, uploadable)
            );
        rowNode
            .querySelector("a.move-up")
            .addEventListener("click", (e) =>
                this._evtMoveClick(e, uploadable, -1)
            );
        rowNode
            .querySelector("a.move-down")
            .addEventListener("click", (e) =>
                this._evtMoveClick(e, uploadable, 1)
            );
    }

    _updateThumbnailNode(uploadable) {
        const rowNode = rowTemplate(
            Object.assign({}, this._ctx, { uploadable: uploadable })
        );
        views.replaceContent(
            uploadable.rowNode.querySelector(".thumbnail"),
            rowNode.querySelector(".thumbnail").childNodes
        );
    }

    get _uploading() {
        return this._formNode.classList.contains("uploading");
    }

    get _listNode() {
        return this._hostNode.querySelector(".uploadables-container");
    }

    get _formNode() {
        return this._hostNode.querySelector("form");
    }

    get _skipDuplicatesCheckboxNode() {
        return this._hostNode.querySelector("form [name=skip-duplicates]");
    }

    get _alwaysUploadSimilarCheckboxNode() {
        return this._hostNode.querySelector(
            "form [name=always-upload-similar]"
        );
    }

    get _pauseRemainOnErrorCheckboxNode() {
        return this._hostNode.querySelector(
            "form [name=pause-remain-on-error]"
        );
    }

    get _autotaggingCheckboxNode() {
        return this._hostNode.querySelector("form [name=autotagging]");
    }

    get _submitButtonNode() {
        return this._hostNode.querySelector("form [type=submit]");
    }

    get _cancelButtonNode() {
        return this._hostNode.querySelector("form .cancel");
    }

    get _contentInputNode() {
        return this._formNode.querySelector(".dropper-container");
    }
}

module.exports = PostUploadView;
