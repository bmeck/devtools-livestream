import {has} from '../util.mjs';
export default class DevtoolsConnection {
  constructor(url, dispatch) {
    const ws = this._websocket = new WebSocket(url);
    return (async () => {
      await new Promise((fulfill, reject) => {
        ws.onopen = fulfill;
        ws.onerror = reject;
      });
      ws.onerror = null;
      ws.onmessage = async ({data}) => {
        const obj = JSON.parse(data);
        console.debug('received', obj);
        if (has(obj, 'method')) {
          if (obj.method === 'Runtime.executionContextCreated') {
            this.executionContexts.set(obj.params.context.id, obj.params.context);
          } else if (obj.method === 'Runtime.executionContextDestroyed') {
            this.executionContexts.delete(obj.params.executionContextId)
          } else if (obj.method === 'Debugger.paused') {
            this.callFrames = obj.params.callFrames;
          } else if (obj.method === 'Debugger.resumed') {
            this.callFrames = [];
          } else if (obj.method === 'Debugger.scriptParsed') {
            this.scripts.set(obj.params.scriptId, obj.params);
          }
          dispatch(obj.method, obj.params);
        } else if (has(obj, 'error')) {
          this._requests.get(obj.id).reject(obj.error);
        } else if (has(obj, 'result')) {
          this._requests.get(obj.id).fulfill(obj.result);
        } else {
          throw new Error(`Unknown message format for: ${data}`);
        }
      };
      this._websocket = ws;
      this._requests = new Map;
      this._next_id = 1;

      this.callFrames = [];
      this.executionContexts = new Map;
      this.scripts = new Map;
      return this;
    })();
  }
  isPaused() {
    return this.callFrames.length > 0;
  }
  getScript(callFrameNumber = -1) {
    return this.scripts.get(this.callFrames.slice(callFrameNumber)[0].location.scriptId)
  }
  getExecutionContext(callFrameNumber) {
    const callFrame = this.getScript(callFrameNumber);
    return this.executionContexts.get(callFrame.executionContextId);
  }
  async request(obj) {
    let id = this._next_id++;
    const req = {
      __proto__: null,
      ...obj,
      id,
      type: 'request'
    };
    console.debug('sent', req);
    this._websocket.send(JSON.stringify(req));
    return new Promise((fulfill, reject) => {
      this._requests.set(id, {
        fulfill,
        reject
      });
    });
  }
  async standardInit() {
    const init = Promise.all([
      this.request({method: 'Runtime.enable'}),
      this.request({method: 'Debugger.enable'}),
      this.request({method: 'Debugger.pause'}),
      this.request({method: 'HeapProfiler.enable'}),
    ]);
    await this.request({method: 'Runtime.runIfWaitingForDebugger'});
    await init;
    return this;
  }
}