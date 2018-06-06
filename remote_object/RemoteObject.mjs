import {has, unwrapRemoteJSON} from '../util.mjs';
export default class RemoteObject {
  constructor({
    connection,
    source
  }) {
    this.conn = connection;
    this.source = source;
  }
  static async releaseGroup(objectGroup) {
    return await this.conn.request({
      method: 'Runtime.releaseObject',
      params: {
        objectGroup: `${objectGroup}`
      }
    });
  }
  async release() {
    const objectId = this.objectId();
    if (!objectId) return;
    return await this.conn.request({
      method: 'Runtime.releaseObject',
      params: {
        objectId
      }
    });
  }
  type() {
    return this.source.type;
  }
  subtype() {
    return has(this.source, 'subtype') ? this.source.subtype : void 0;
  }
  className() {
    return has(this.source, 'className') ? this.source.className : void 0;
  }
  objectId() {
    return has(this.source, 'objectId') ? this.source.objectId : void 0;
  }
  value() {
    if (this.type() === 'object' && this.subtype() === 'null') return null;
    if (this.type() === 'undefined') return void 0;
    if (has(this.source, 'value')) return this.source.value;
    if (has(this.source, 'unserializableValue')) {
      if (this.source.unserializableValue === 'Infinity') return 1/0;
      if (this.source.unserializableValue === '-Infinity') return -1/0;
      if (this.source.unserializableValue === '-0') return -0;
      if (this.source.unserializableValue === 'NaN') return 0/0;
    }
    throw new TypeError('cannot reify value, was it a reference type?');
  }
  async callFunctionOn(functionDeclaration, {args: [...args] = []}) {
    return RemoteObject.fromRemoteObjectJSON({
      connection,
      source: unwrapRemoteJSON(await connection.request({
        method: 'Runtime.callFunctionOn',
        params: {
          objectId,
          functionDeclaration: `${functionDeclaration}`,
          ...(args.length ? {arguments: args} : null)
        }
      })).result
    });
  }
  asCallArgument() {
    const objectId = this.objectId();
    if (objectId) {
      return {
        __proto__: null, objectId
      };
    } else if (this.type() === 'undefined') {
      return {
        __proto__: null
      };
    } else if (has(this.source, 'unserializableValue')) {
      return {
        __proto__: null,
        unserializableValue: this.source.unserializableValue
      };
    } else if (has(this.source, 'value')) {
      return {
        __proto__: null,
        value: this.source.value
      };
    } else {
      throw TypeError('unexpected value');
    }
  }
  // due to .toString, .valueOf, .toPrimitive, document.all, etc.
  // these need calls out to remote land
  async toRemoteFloat() {
    const objectId = this.objectId();
    const connection = this.conn;
    if (!objectId) {
      return RemoteObject.fromValue({
        connection,
        value: +this.value()
      });
    }
    return this.callFunctionOn('function () {return +this;}');
  }
  async toRemoteInteger() {
    const objectId = this.objectId();
    const connection = this.conn;
    if (!objectId) {
      return RemoteObject.fromValue({
        connection,
        value: this.value() | 0
      });
    }
    return this.callFunctionOn('function () {return this|0;}');
  };
  async toRemoteString() {
    const objectId = this.objectId();
    const connection = this.conn;
    if (!objectId) {
      return RemoteObject.fromValue({
        connection,
        value: `${this.value()}`
      });
    }
    return this.callFunctionOn('function () {return `${this}`;}');
  };
  async getProperties() {
    const objectId = this.objectId();
    if (!objectId) throw new TypeError('not a reference');
    if (this.type() === 'symbol') throw new TypeError('cannot get properties of a Symbol');
    const connection = this.conn;
    const rep = unwrapRemoteJSON(await connection.request({
      method: 'Runtime.getProperties',
      params: {
        objectId,
        ownProperties: true,
      }
    }));
    if (!has(rep, 'internalProperties')) {
      rep.internalProperties = [];
    }
    for (const descriptor of rep.internalProperties) {
      descriptor.value = RemoteObject.fromRemoteObjectJSON({
        connection,
        source: descriptor.value
      });
    }
    // the object prototype is not treated as a special property
    // that means if someone defines a real property using
    // .defineProperty or {["__proto__"]:{}} we have multiple in the same list...
    // have to find the last instance of it... and move it to internal properties...
    let prototype = -1;
    for (let i = 0; i < rep.result.length; i++) {
      const descriptor = rep.result[i];
      if (has(descriptor, 'name')) {
        if (descriptor.name === '__proto__') {
          prototype = i;
        }
        // length is a magical property on arrays
        if (this.subtype() === 'array' && descriptor.name === 'length') {
          rep.internalProperties.push({
            name: 'length',
            value: RemoteObject.fromRemoteObjectJSON({
              connection,
              source: rep.result.splice(i, 1)[0].value
            })
          });
          i--;
          continue;
        }
      } else {
        descriptor.symbol = RemoteObject.fromRemoteObjectJSON({
          connection,
          source: descriptor.symbol
        });
      }
      if (has(descriptor, 'value')) {
        descriptor.value = RemoteObject.fromRemoteObjectJSON({
          connection,
          source: descriptor.value
        });
      } else {
        if (has(descriptor, 'get')) {
          descriptor.get = RemoteObject.fromRemoteObjectJSON({
            connection,
            source: descriptor.get
          });
        }
        if (has(descriptor, 'set')) {
          descriptor.set = RemoteObject.fromRemoteObjectJSON({
            connection,
            source: descriptor.set
          });
        }
      }
    }
    // Object.protoype defines an accessor
    if (prototype !== -1) {
      const proto = rep.result.splice(prototype, 1)[0];
      if (has(proto, 'value')) {
        rep.internalProperties.push({
          name: '__proto__',
          value: proto.value
        });
      } else {
        rep.internalProperties.push({
          name: '__proto__',
          get: proto.get,
          set: proto.set
        });
      }
    }
    return rep;
  }
  static fromRemoteObjectJSON({
    connection,
    source,
  }) {
    return new RemoteObject({
      connection,
      source
    });
  }
  static fromValue({
    connection,
    value,
  }) {
    const type = typeof value;
    if (type === 'string' || type === 'boolean') {
      return new RemoteObject({
        connection,
        source: {
          type,
          value
        }
      });
    } else if (type === 'number') {
      return new RemoteObject({
        connection,
        source: {
          type,
          ...(
            Number.isFinite(value) && !Object.is(value, -0) ?
            {value} :
            {unserializableValue: `${value}`}
          )
        }
      });
    } else if (type === 'undefined') {
      return new RemoteObject({
        connection,
        source: {
          type
        }
      });
    } else if (value === null) {
      return new RemoteObject({
        connection,
        source: {
          type: 'object',
          subtype: 'null'
        }
      });
    } else {
      throw TypeError('cannot create virtual reference types');
    }
  }
}
