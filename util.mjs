export const has = Function.call.bind(Object.prototype.hasOwnProperty);
export const unwrapRemoteJSON = (json) => {
  if (has(json, 'exceptionDetails')) {
    throw json.exceptionDetails;
  } else {
    // some results include other fields than .result
    // like Runtime.getProperties => .internalProperties
    return json;
  }
}