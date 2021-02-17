/**
 * @flow
 */

import Agent from 'react-devtools-shared/src/backend/agent';
import Bridge, {BackendBridge} from 'react-devtools-shared/src/bridge';
import {installHook} from 'react-devtools-shared/src/hook';
import {initBackend} from 'react-devtools-shared/src/backend';
import {updateBridge, savedPreferencesString, installHighlighter, initComponentFilters} from './devtools-init';

savedPreferencesString();
installHook(window);
initComponentFilters(window);

const hook: ?DevToolsHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;  
const bridge: BackendBridge = new Bridge({
    listen(){},
    send(event: string, payload: any) {
        agent.emit(event, payload);
    }
});
const agent = new Agent(bridge);

updateBridge(bridge, agent);
initBackend(hook, agent, window);

installHighlighter(agent, bridge, window);