<template>
  <!-- Note -->
  <div class="pb-4">
    <!-- Loading -->
    <div
      v-if="currentNote == null"
      class="h-100 d-flex flex-column justify-content-center"
    >
      <LoadingIndicator
        :failed="noteLoadFailed"
        :failedBootstrapIcon="noteLoadFailedIcon"
        :failedMessage="noteLoadFailedMessage"
      />
    </div>

    <!-- Loaded -->
    <div v-else class="d-flex flex-column h-100">
      <!-- Buttons -->
      <div
        class="d-flex justify-content-between flex-wrap align-items-end mb-3"
      >
        <!-- Title -->
        <h2 v-if="editMode == false" class="title" :title="currentNote.title">
          {{ currentNote.title }}
        </h2>
        <input
          v-else
          type="text"
          class="h2 title-input flex-grow-1"
          v-model="titleInput"
          placeholder="Title"
        />

        <!-- Buttons -->
        <div class="d-flex">
          <!-- Edit -->
          <button
            v-if="canModify && editMode == false && noteLoadFailed == false"
            type="button"
            class="bttn"
            @click="setEditMode(true)"
            v-b-tooltip.hover
            title="Keyboard Shortcut: e"
          >
            <b-icon icon="pencil-square"></b-icon> Edit
          </button>

          <!-- Delete -->
          <button
            v-if="canModify && editMode == false && noteLoadFailed == false"
            type="button"
            class="bttn"
            @click="deleteNote"
          >
            <b-icon icon="trash"></b-icon> Delete
          </button>

          <!-- Cancel -->
          <button
            v-if="editMode == true"
            type="button"
            class="bttn"
            @click="confirmCancelNote"
          >
            <b-icon icon="arrow-return-left"></b-icon> Cancel
          </button>

          <!-- Save -->
          <button
            v-if="editMode == true"
            type="button"
            class="bttn"
            @click="saveNote"
          >
            <b-icon icon="check-square"></b-icon> Save
          </button>
        </div>
      </div>

      <!-- Viewer -->
      <div v-if="editMode == false" class="note note-viewer">
        <viewer :initialValue="currentNote.content" :options="viewerOptions" />
      </div>

      <!-- Editor -->
      <div v-else class="note flex-grow-1">
        <editor
          :initialValue="initialContent"
          :initialEditType="loadDefaultEditorMode()"
          previewStyle="tab"
          ref="toastUiEditor"
          :options="editorOptions"
          height="100%"
          @change="startDraftSaveTimeout"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import "../colours";
@import "../mixins";

.title {
  min-width: 300px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  color: var(--colour-text);
  margin: 0;
}

.title-input {
  border: none;

  // Override user agent styling
  background-color: transparent;
  color: var(--colour-text);
  padding: 0;

  &:focus {
    outline: none;
  }
}
</style>

<style lang="scss">
// Toast UI Markdown Editor
@import "@toast-ui/editor/dist/toastui-editor.css";
@import "@toast-ui/editor/dist/toastui-editor-viewer.css";
@import "prismjs/themes/prism.css";
@import "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css";

@import "../colours";
@import "../mixins";
@import "../toastui-editor-theme.scss";

.ProseMirror {
  font-family: "Inter", sans-serif;
}

.toastui-editor-contents {
  font-family: "Inter", sans-serif;
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    border-bottom: none;
  }
  @include note-padding;
}

.toastui-editor-defaultUI .ProseMirror {
  @include note-padding;
}

// Override the default font-family for code blocks as some of the fallbacks are not monospace
.toastui-editor-contents code,
.toastui-editor-contents pre,
.toastui-editor-md-code,
.toastui-editor-md-code-block {
  font-family: Consolas, "Lucida Console", Monaco, "Andale Mono", monospace;
}

// Disable checkboxes in view mode. See https://github.com/nhn/tui.editor/issues/1087.
.note-viewer li.task-list-item {
  pointer-events: none;
  a {
    pointer-events: auto;
  }
}
</style>

<script>
import * as constants from "../constants";

import { Editor } from "@toast-ui/vue-editor";
import EventBus from "../eventBus";
import LoadingIndicator from "./LoadingIndicator";
import Mousetrap from "mousetrap";
import { Note } from "../classes";
import { Viewer } from "@toast-ui/vue-editor";
import api from "../api";
import codeSyntaxHighlight from "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight-all.js";

const reservedFilenameCharacters = /[<>:"/\\|?*]/;

const customHTMLRenderer = {
  heading(node, { entering, getChildrenText }) {
    const tagName = `h${node.level}`;

    if (entering) {
      return {
        type: "openTag",
        tagName,
        attributes: {
          id: getChildrenText(node)
            .toLowerCase()
            .replace(/[^a-z0-9-\s]*/g, "")
            .trim()
            .replace(/\s/g, "-"),
        },
      };
    }
    return { type: "closeTag", tagName };
  },
};

export default {
  components: {
    Viewer,
    Editor,
    LoadingIndicator,
  },

  props: {
    titleToLoad: { type: String, default: null },
    authType: { type: String, default: null },
  },

  data: function () {
    return {
      editMode: false,
      draftSaveTimeout: null,
      currentNote: null,
      titleInput: null,
      initialContent: null,
      noteLoadFailed: false,
      noteLoadFailedIcon: null,
      noteLoadFailedMessage: "Failed to load Note",
      viewerOptions: {
        customHTMLRenderer: customHTMLRenderer,
        plugins: [codeSyntaxHighlight],
        extendedAutolinks: true,
      },
      editorOptions: {
        customHTMLRenderer: customHTMLRenderer,
        plugins: [codeSyntaxHighlight],
        hooks: {
          addImageBlobHook: this.uploadImageHook,
        },
      },
    };
  },

  computed: {
    canModify: function () {
      return (
        this.authType != null && this.authType != constants.authTypes.readOnly
      );
    },
  },

  watch: {
    titleToLoad: function () {
      if (this.titleToLoad !== this.currentNote?.title) {
        this.init();
      }
    },
  },

  methods: {
    badFilenameToast: function (invalidItem) {
      this.$bvToast.toast(
        `Invalid ${invalidItem}. Due to filename restrictions, the following characters are not allowed: <>:"/\\|?*`,
        {
          variant: "danger",
          noCloseButton: true,
          toaster: "b-toaster-bottom-right",
        }
      );
    },

    loadNote: function (title) {
      let parent = this;
      this.noteLoadFailed = false;
      api
        .get(`${window.flatnotesRootPath}/api/notes/${encodeURIComponent(title)}`)
        .then(function (response) {
          parent.currentNote = new Note(
            response.data.title,
            response.data.lastModified,
            response.data.content
          );
          // EventBus.$emit("updateDocumentTitle", parent.currentNote.title);
        })
        .catch(function (error) {
          if (error.handled) {
            return;
          } else if (
            typeof error.response !== "undefined" &&
            error.response.status == 404
          ) {
            parent.noteLoadFailedIcon = "file-earmark-x";
            parent.noteLoadFailedMessage = "Note not found";
            parent.noteLoadFailed = true;
          } else {
            EventBus.$emit("unhandledServerError");
            parent.noteLoadFailed = true;
          }
        });
    },

    getContentForEditor: function () {
      let draftContent = localStorage.getItem(this.currentNote.title);
      if (draftContent) {
        if (confirm("Do you want to resume the saved draft?")) {
          return draftContent;
        } else {
          localStorage.removeItem(this.currentNote.title);
        }
      }
      return this.currentNote.content;
    },

    setBeforeUnloadConfirmation: function (enable = true) {
      if (enable) {
        window.onbeforeunload = function () {
          return true;
        };
      } else {
        window.onbeforeunload = null;
      }
    },

    setEditMode: function (editMode = true) {
      let parent = this;

      // To Edit Mode
      if (editMode === true) {
        this.setBeforeUnloadConfirmation(true);
        this.titleInput = this.currentNote.title;
        let draftContent = localStorage.getItem(this.currentNote.title);

        if (draftContent) {
          this.$bvModal
            .msgBoxConfirm(
              "There is an unsaved draft of this note stored in this browser. Do you want to resume the draft version or delete it?",
              {
                centered: true,
                title: "Resume Draft?",
                okTitle: "Resume Draft",
                cancelTitle: "Delete Draft",
                cancelVariant: "danger",
              }
            )
            .then(function (response) {
              if (response == true) {
                parent.initialContent = draftContent;
              } else {
                parent.initialContent = parent.currentNote.content;
                localStorage.removeItem(parent.currentNote.title);
              }
              parent.editMode = true;
            });
        } else {
          this.initialContent = this.currentNote.content;
          this.editMode = true;
        }
      }
      // To View Mode
      else {
        this.titleInput = null;
        this.initialContent = null;
        this.setBeforeUnloadConfirmation(false);
        this.editMode = false;
      }
    },

    getEditorContent: function () {
      if (typeof this.$refs.toastUiEditor != "undefined") {
        return this.$refs.toastUiEditor.invoke("getMarkdown");
      } else {
        return null;
      }
    },

    saveDefaultEditorMode: function () {
      let isWysiwygMode = this.$refs.toastUiEditor.invoke("isWysiwygMode");
      localStorage.setItem(
        "defaultEditorMode",
        isWysiwygMode ? "wysiwyg" : "markdown"
      );
    },

    loadDefaultEditorMode: function () {
      let defaultWysiwygMode = localStorage.getItem("defaultEditorMode");
      if (defaultWysiwygMode) {
        return defaultWysiwygMode;
      } else {
        return "markdown";
      }
    },

    clearDraftSaveTimeout: function () {
      if (this.draftSaveTimeout != null) {
        clearTimeout(this.draftSaveTimeout);
      }
    },

    startDraftSaveTimeout: function () {
      this.clearDraftSaveTimeout();
      this.draftSaveTimeout = setTimeout(this.saveDraft, 1000);
    },

    saveDraft: function () {
      let content = this.getEditorContent();
      if (content) {
        localStorage.setItem(this.currentNote.title, content);
      }
    },

    existingTitleToast: function () {
      this.$bvToast.toast(
        "A note with this title already exists. Please try again with a new title.",
        {
          title: "Duplicate ✘",
          variant: "danger",
          noCloseButton: true,
          toaster: "b-toaster-bottom-right",
        }
      );
    },

    saveNote: function () {
      let parent = this;
      let newContent = this.getEditorContent();

      this.saveDefaultEditorMode();

      // Title Validation
      if (typeof this.titleInput == "string") {
        this.titleInput = this.titleInput.trim();
      }
      if (!this.titleInput) {
        this.$bvToast.toast("Cannot save note without a title ✘", {
          variant: "danger",
          noCloseButton: true,
          toaster: "b-toaster-bottom-right",
        });
        return;
      }

      if (reservedFilenameCharacters.test(this.titleInput)) {
        this.badFilenameToast("title");
        return;
      }

      // New Note
      if (this.currentNote.lastModified == null) {
        api
          .post(`${window.flatnotesRootPath}/api/notes`, {
            title: this.titleInput,
            content: newContent,
          })
          .then(this.saveNoteResponseHandler)
          .catch(function (error) {
            if (error.handled) {
              return;
            } else if (
              typeof error.response !== "undefined" &&
              error.response.status == 409
            ) {
              parent.existingTitleToast();
            } else {
              EventBus.$emit("unhandledServerError");
            }
          });
      }

      // Modified Note
      else if (
        newContent != this.currentNote.content ||
        this.titleInput != this.currentNote.title
      ) {
        api
          .patch(`${window.flatnotesRootPath}/api/notes/${encodeURIComponent(this.currentNote.title)}`, {
            newTitle: this.titleInput,
            newContent: newContent,
          })
          .then(this.saveNoteResponseHandler)
          .catch(function (error) {
            if (error.handled) {
              return;
            } else if (
              typeof error.response !== "undefined" &&
              error.response.status == 409
            ) {
              parent.existingTitleToast();
            } else {
              EventBus.$emit("unhandledServerError");
            }
          });
      }

      // No Change
      else {
        localStorage.removeItem(this.currentNote.title);
        this.setEditMode(false);
        this.noteSavedToast();
      }
    },

    saveNoteResponseHandler: function (response) {
      localStorage.removeItem(this.currentNote.title);
      this.currentNote = new Note(
        response.data.title,
        response.data.lastModified,
        response.data.content
      );
      EventBus.$emit("updateNoteTitle", this.currentNote.title);
      history.replaceState(null, "", this.currentNote.href);
      this.setEditMode(false);
      this.noteSavedToast();
    },

    noteSavedToast: function () {
      this.$bvToast.toast("Note saved ✓", {
        variant: "success",
        noCloseButton: true,
        toaster: "b-toaster-bottom-right",
      });
    },

    cancelNote: function () {
      localStorage.removeItem(this.currentNote.title);
      if (this.currentNote.lastModified == null) {
        // Cancelling a new note
        EventBus.$emit("navigate", constants.basePaths.home);
      } else {
        this.setEditMode(false);
      }
    },

    confirmCancelNote: function () {
      let parent = this;
      let newContent = this.getEditorContent();
      if (
        newContent != this.currentNote.content ||
        this.titleInput != this.currentNote.title
      ) {
        this.$bvModal
          .msgBoxConfirm(
            `Are you sure you want to close the note '${this.currentNote.title}' without saving?`,
            {
              centered: true,
              title: "Confirm Closure",
              okTitle: "Yes, Close",
              okVariant: "warning",
            }
          )
          .then(function (response) {
            if (response == true) {
              parent.cancelNote();
            }
          });
      } else {
        this.cancelNote();
      }
    },

    deleteNote: function () {
      let parent = this;
      this.$bvModal
        .msgBoxConfirm(
          `Are you sure you want to delete the note '${this.currentNote.title}'?`,
          {
            centered: true,
            title: "Confirm Deletion",
            okTitle: "Delete",
            okVariant: "danger",
          }
        )
        .then(function (response) {
          if (response == true) {
            api
              .delete(
                `${window.flatnotesRootPath}/api/notes/${encodeURIComponent(parent.currentNote.title)}`
              )
              .then(function () {
                parent.$emit("note-deleted");
                EventBus.$emit("navigate", constants.basePaths.home);
              })
              .catch(function (error) {
                if (!error.handled) {
                  EventBus.$emit("unhandledServerError");
                }
              });
          }
        });
    },

    uploadImageHook(file, callback) {
      // image.png is the default name given to images copied from the clipboard. To avoid conflicts we'll append a timestamp.
      if (file.name == "image.png") {
        const currentDateString = new Date().toISOString().replace(/:/g, "-");
        file = new File([file], `image-${currentDateString}.png`, {
          type: file.type,
        });
      }

      // If the user has entered an alt text, use it. Otherwise, use the filename.
      const altTextInputValue = document.getElementById(
        "toastuiAltTextInput"
      )?.value;
      const altText = altTextInputValue ? altTextInputValue : file.name;

      // Upload the image then use the callback to insert the URL into the editor
      this.postAttachment(file).then(function (success) {
        if (success === true) {
          // Use relative path so that the attachment URL stored in the note's markdown file works with any flatnotesRootPath.
          callback(`../attachments/${encodeURIComponent(file.name)}`, altText);
        }
      });
    },

    postAttachment(file) {
      let parent = this;

      if (reservedFilenameCharacters.test(file.name)) {
        this.badFilenameToast("filename");
        return false;
      }

      this.$bvToast.toast("Uploading attachment...", {
        variant: "success",
        noCloseButton: true,
        toaster: "b-toaster-bottom-right",
      });

      const formData = new FormData();
      formData.append("file", file);
      return api
        .post(`${window.flatnotesRootPath}/api/attachments`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        })
        .then(function () {
          parent.$bvToast.toast("Attachment uploaded ✓", {
            variant: "success",
            noCloseButton: true,
            toaster: "b-toaster-bottom-right",
          });
          return true;
        })
        .catch(function (error) {
          if (error.response?.status == 409) {
            parent.$bvToast.toast(
              "An attachment with this filename already exists ✘",
              {
                variant: "danger",
                noCloseButton: true,
                toaster: "b-toaster-bottom-right",
              }
            );
          } else {
            parent.$bvToast.toast("Failed to upload attachment ✘", {
              variant: "danger",
              noCloseButton: true,
              toaster: "b-toaster-bottom-right",
            });
          }
          return false;
        });
    },

    init: function () {
      this.currentNote = null;
      if (this.titleToLoad) {
        this.loadNote(this.titleToLoad);
        this.setEditMode(false);
      } else {
        this.currentNote = new Note();
        this.setEditMode(true);
      }
    },
  },

  created: function () {
    let parent = this;

    // 'e' to edit
    Mousetrap.bind("e", function () {
      if (parent.editMode == false && parent.canModify) {
        parent.setEditMode(true);
      }
    });

    // 'ctrl+s' to save
    // Mousetrap.bind("ctrl+s", function () {
    //   if (parent.editMode == true) {
    //     parent.saveNote();
    //     return false;
    //   }
    // });

    this.init();
  },
};
</script>
