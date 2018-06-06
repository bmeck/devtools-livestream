import {has} from '../util.mjs';
import RemoteObject from './RemoteObject.mjs';
const objectWrapper = Object.assign(document.createElement('details'), {
  innerHTML: '<summary class=objectTree></summary><table class=propertyTable></table>'
});
const propertyWrapper = Object.assign(document.createElement('tr'), {
  innerHTML: '<th></th></tr><tr><td></td>',
  className: 'propertyRow',
});
const createContainer = (template, ref) => {
  const elem = template.cloneNode(true);
  const objectId = ref.objectId();
  if (objectId) {
    elem.dataset.objectId = objectId;
  }
  return elem;
}
const renderRow = async (propertyDescriptor, table, internal) => {
  const classes = internal ? ['internal'] : [];
  if (has(propertyDescriptor, 'value')) {
    const line = document.importNode(propertyWrapper, true);
    line.classList.add(...classes);
    line.querySelector('th').textContent = has(propertyDescriptor, 'name') ?
      propertyDescriptor.name :
      renderAsName(propertyDescriptor.symbol);
    const value = await PLAIN_FORMATTER.renderAsObject(propertyDescriptor.value);
    line.querySelector('td').appendChild(value)
    table.appendChild(line);
  } else {
    if (has(propertyDescriptor, 'get') && propertyDescriptor.get.type() !== 'undefined') {
      const line = document.importNode(propertyWrapper, true);
      line.classList.add(...classes);
      line.querySelector('th').textContent = has(propertyDescriptor, 'name') ?
        `get ${propertyDescriptor.name}` :
        'get symbol';
      const value = await PLAIN_FORMATTER.renderAsObject(propertyDescriptor.get);
      line.querySelector('td').appendChild(value);
      table.appendChild(line);
    }
    if (has(propertyDescriptor, 'set') && propertyDescriptor.set.type() !== 'undefined') {
      const line = document.importNode(propertyWrapper, true);
      line.classList.add(...classes);
      line.querySelector('th').textContent = has(propertyDescriptor, 'name') ?
        `set ${propertyDescriptor.name}` :
        'set symbol';
      const value = await PLAIN_FORMATTER.renderAsObject(propertyDescriptor.set);
      line.querySelector('td').appendChild(value);
      table.appendChild(line);
    }
  }
}
const objectTemplate = document.createElement('span');
const renderObjectElement = (ref) => {
  const container = createContainer(objectTemplate, ref);
  const wrap = document.importNode(objectWrapper, true);
  container.appendChild(wrap);
  const summary = wrap.querySelector('summary');
  const table = wrap.querySelector('table');
  summary.textContent = `${ref.className() || ref.subtype() || ref.type()}`
  wrap.ontoggle = async e => {
    const res = await ref.getProperties();
    const {
      result: properties,
      internalProperties,
    } = res;
    table.innerHTML = '';
    for (const propertyDescriptor of properties) {
      await renderRow(propertyDescriptor, table);
    }
    for (const propertyDescriptor of internalProperties) {
      await renderRow(propertyDescriptor, table, true);
    }
  }
  return container;
}
export default class RemoteObjectFormatter {
  constructor(cssText) {
    this.template = document.createElement('span');
    this.template.cssText = cssText;
    const style = this.template.style;
    style.animation = 'unset';
    style.clip = 'unset';
    style.clear = 'unset';
    style.filter = 'unset';
    style.mask = 'unset';
    style.position = 'unset';
    style.pointerEvents = 'unset';
    style.transform = 'unset';
    return this;
  }
  async renderAsFloat(ref) {
    const e = this.template.cloneNode(true);
    e.textContent = `${(await ref.toRemoteFloat()).value()}`;
    return e;
  }
  async renderAsInteger(ref) {
    const e = createContainer(this.template, ref);
    e.textContent = `${(await ref.toRemoteInteger()).value()}`;
    return e;
  }
  async renderAsString(ref) {
    const e = createContainer(this.template, ref);
    e.textContent = `${(await ref.toRemoteString()).value()}`;
    return e;
  }
  renderString(str) {
    if (typeof str !== 'string') {
      throw new TypeError();
    }
    return document.createTextNode(str);
  }
  async renderAsObject(ref) {
    if (ref instanceof RemoteObject !== true) {
      debugger;
    }
    const type = ref.type();
    let text = '';
    if (type === 'object') {
      if (ref.subtype() !== 'null') {
        if (ref.subtype() === 'internal#location') {
          const url = ref.conn.scripts.get(ref.source.value.scriptId).url;
          const button = document.createElement('button');
          button.type = 'button';
          button.onclick = e => {
            ;
          }
          button.textContent = url;
          return button;
        }
        return renderObjectElement(ref);
      } else {
        text = 'null';
      }
    } else if (type === 'function') {
      return renderObjectElement(ref);
    } else if (type === 'number') {
      text = `${(await ref.toRemoteFloat()).value()}`;
    } else if (type === 'boolean') {
      text = `${(await ref.toRemoteString()).value()}`;
    } else if (type === 'string') {
      text = `${JSON.stringify((await ref.toRemoteString()).value())}`;
    } else if (type === 'undefined') {
      text = 'undefined';
    } else if (type === 'symbol') {
      text = `${(await ref.source.description)}`;
    } else {
      debugger;
      throw new TypeError('unknown render request type');
    }
    const e = createContainer(this.template, ref);
    e.textContent = text;
    return e;
  }
}
const PLAIN_FORMATTER = new RemoteObjectFormatter();
