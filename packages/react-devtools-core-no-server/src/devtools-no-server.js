/**
 * @flow
 */

import Agent from 'react-devtools-shared/src/backend/agent';
import Bridge, {BackendBridge} from 'react-devtools-shared/src/bridge';
import {installHook} from 'react-devtools-shared/src/hook';
import {initBackend} from 'react-devtools-shared/src/backend';

import {getDefaultComponentFilters} from 'react-devtools-shared/src/utils';
import {
    getAppendComponentStack,
    getBreakOnConsoleErrors,
    getSavedComponentFilters,
    getShowInlineWarningsAndErrors,
  } from 'react-devtools-shared/src/utils';
import type {ComponentFilter} from 'react-devtools-shared/src/types';

function savedPreferencesString() {
    window.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = getAppendComponentStack();
    window.__REACT_DEVTOOLS_BREAK_ON_CONSOLE_ERRORS__ = getBreakOnConsoleErrors();
    window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = getSavedComponentFilters();
    window.__REACT_DEVTOOLS_SHOW_INLINE_WARNINGS_AND_ERRORS__ = getShowInlineWarningsAndErrors();
}

savedPreferencesString();
installHook(window);

let savedComponentFilters: Array<ComponentFilter> = getDefaultComponentFilters();
const hook: ?DevToolsHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

const bridge: BackendBridge = new Bridge({
    listen(){},
    send(event: string, payload: any) {
        agent.emit(event, payload);
    }
});

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

const agent = new Agent(bridge);
initBackend(hook, agent, window);
