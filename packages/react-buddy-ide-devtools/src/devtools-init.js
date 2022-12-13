import memoize from 'memoize-one';
import throttle from 'lodash.throttle';
import type {ComponentFilter} from 'react-devtools-shared/src/types';
import {ComponentFilterElementType, ElementTypeOtherOrUnknown} from 'react-devtools-shared/src/types';
import {
    getAppendComponentStack,
    getBreakOnConsoleErrors,
    getSavedComponentFilters,
    getShowInlineWarningsAndErrors,
  } from 'react-devtools-shared/src/utils';
import {getDefaultComponentFilters} from 'react-devtools-shared/src/utils';
import {debounceWrapper} from "./devtools-init.utils";
import {hideOverlay, showOverlay} from "../../react-devtools-shared/src/backend/views/Highlighter/Highlighter"

let requestCounter = 0;
function getRequestId() {
  requestCounter++;
  return requestCounter;
}

export function initComponentFilters(target) {
    target.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = [
        {
            type: ComponentFilterElementType,
            value: ElementTypeOtherOrUnknown,
            isEnabled: true
        }
    ]
}

export function savedPreferencesString() {
    window.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = getAppendComponentStack();
    window.__REACT_DEVTOOLS_BREAK_ON_CONSOLE_ERRORS__ = getBreakOnConsoleErrors();
    window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = getSavedComponentFilters();
    window.__REACT_DEVTOOLS_SHOW_INLINE_WARNINGS_AND_ERRORS__ = getShowInlineWarningsAndErrors();
}

export function sendSuccessInitMessage() {
    if (typeof window.cefQuery === "function") {
        window.cefQuery({request: "event:react-toolbox-initialized"});
    }
}

export function updateBridge(bridge, agent) {

    let savedComponentFilters: Array<ComponentFilter> = getDefaultComponentFilters();

    bridge.addListener(
        'inspectElement',
        ({id, rendererID}: {id: number, rendererID: number, ...}) => {
            const renderer = agent.rendererInterfaces[rendererID];
            if (renderer != null) {
                // Send event for RN to highlight.
                const nodes: ?Array<HTMLElement> = renderer.findNativeNodesForFiberID(id);
                if (nodes != null && nodes[0] != null) {
                    agent.emit('showNativeHighlight', nodes[0]);
                }
            }
        },
    );

    bridge.addListener(
        'updateComponentFilters',
        (componentFilters: Array<ComponentFilter>) => {
            // Save filter changes in memory, in case DevTools is reloaded.
            // In that case, the renderer will already be using the updated values.
            // We'll lose these in between backend reloads but that can't be helped.
            savedComponentFilters = componentFilters;
        },
    );

    if (window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ == null) {
        bridge.send('overrideComponentFilters', savedComponentFilters);
    }
}

export function installHighlighter(agent, bridge, target) {
    target.setHighlight = debounceWrapper((file, line) => {
        for (let [rendererID, renderer] of Object.entries(agent.rendererInterfaces)) {
            const sourceDataItem = renderer.findFibersSourceData(file, line);
            if (sourceDataItem) {
                const {id, displayName} = sourceDataItem;
                bridge.emit('highlightNativeElement', {id, rendererID, displayName});
                return;
            }
        }
        console.warn(`Component on line ${line} not found ("${file}")`);
        bridge.emit('stopInspectingNative');
    },
    250);
}

export function initHighlightngGlobalSettings(target) {
    target.__HIGHLIGHTING_GLOBAL_SETTINGS__ = {
        enabled: true,
        hoverHighlightingMode: false,
        clickHighlightingMode: true
    }
}

export function installHighlightingModeChangingApi(target, agent) {
    target.setClickingHighlightingMode = function () {
        target.__HIGHLIGHTING_GLOBAL_SETTINGS__ = {
            enabled: true,
            hoverHighlightingMode: false,
            clickHighlightingMode: true
        }
        hideOverlay(agent);
    }

    target.setHoverHighlightingMode = function () {
        target.__HIGHLIGHTING_GLOBAL_SETTINGS__ = {
            enabled: true,
            hoverHighlightingMode: true,
            clickHighlightingMode: false
        }
        hideOverlay(agent);
    }

    target.disableHighlighting = function () {
        target.__HIGHLIGHTING_GLOBAL_SETTINGS__ = {
            enabled: false,
            hoverHighlightingMode: false,
            clickHighlightingMode: false
        }
        hideOverlay(agent);
    }
}

export function installHighlightingClickHandler(target, agent) {

    function traverseToElementWithSource(id, rendererID) {
        const renderer = agent.rendererInterfaces[rendererID];
        if (renderer == null) {
          console.warn(`Invalid renderer id "${rendererID}" for element "${id}"`);
          return
        }
        const inspectedElement = renderer.inspectElement(getRequestId(), id, null, true);
        if (!inspectedElement) return null;
        const elInfo = inspectedElement.value;
        if (!elInfo) return null;
        if (elInfo.source) return inspectedElement;
        for (let i = 0; i < elInfo.owners.length; i++) {
          const ownerEl = renderer.inspectElement(getRequestId(), elInfo.owners[i].id, null, true);
          if (ownerEl?.value?.source) {
            return ownerEl
          }
        }
      }

      const setHighlight = throttle(
        memoize((node: HTMLElement) => {
          const {id = null, rendererID} = {...agent.getIDForNode(node)};
          if (id !== null) {
            if (typeof target.cefQuery === 'function') {
              showOverlay([node], null, agent, false);
              const elementWithSource = traverseToElementWithSource(id, rendererID);
              if (elementWithSource == null) {
                return
              }
              target.cefQuery({request: elementWithSource.value.source.fileName +
                  ':' + elementWithSource.value.source.lineNumber+':'+elementWithSource.value.source.columnNumber});
            }
          }
        }),
        200,
        // Don't change the selection in the very first 200ms
        // because those are usually unintentional as you lift the cursor.
        {leading: false},
      );

    target.addEventListener('click', function(e) {
        if(target.__HIGHLIGHTING_GLOBAL_SETTINGS__.clickHighlightingMode && target.isHighlightingEnabled()) {
            e.preventDefault()
            e.stopPropagation();
            setHighlight(e.target);
        }
    }, true);
}

export function installComponentsPropertiesEditorApi(target, agent) {
    target.__PROPERTIES_EDIT_PANEL_ENABLED__ = false;

    target.setPropertiesEditPanelStatus = function(status) {
        target.__PROPERTIES_EDIT_PANEL_ENABLED__ = status;
        hideOverlay(agent);
    }

    target.isHighlightingEnabled = function() {
        return (target.__HIGHLIGHTING_GLOBAL_SETTINGS__.enabled && !target.__PROPERTIES_EDIT_PANEL_ENABLED__)
    }
}

export function installTraceUpdatesApi(target, agent) {
  target.setReactTraceUpdatesEnabled = function(enabled) {
    agent.setTraceUpdatesEnabled(enabled);
  }
}
