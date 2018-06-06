export default (harness, {
  scriptId,
  lineNumber = 0,
  columnNumber = 0
}) => {
  const viewer = await harness.ui.sources.open(scriptId);
  viewer.scollTo({lineNumber, columnNumber});
};
