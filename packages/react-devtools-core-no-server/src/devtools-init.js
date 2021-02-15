import type {ComponentFilter} from 'react-devtools-shared/src/types';
import {
    getAppendComponentStack,
    getBreakOnConsoleErrors,
    getSavedComponentFilters,
    getShowInlineWarningsAndErrors,
  } from 'react-devtools-shared/src/utils';
import {getDefaultComponentFilters} from 'react-devtools-shared/src/utils';
import {debounceWrapper} from "./devtools-init.utils";

export function savedPreferencesString() {
    window.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = getAppendComponentStack();
    window.__REACT_DEVTOOLS_BREAK_ON_CONSOLE_ERRORS__ = getBreakOnConsoleErrors();
    window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = getSavedComponentFilters();
    window.__REACT_DEVTOOLS_SHOW_INLINE_WARNINGS_AND_ERRORS__ = getShowInlineWarningsAndErrors();
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
