let editorText = "Mock data";
(globalThis as any).editorText;

globalThis.syscall = async (name: string, ...args: readonly any[]) => {
  switch (name) {
    // I tried a lot of things to get this working differently, but
    // ended up with just keeping this in a variable that can be changed
    // in the tests.
    case "mock.setText":
      editorText = args[0];
      return await Promise.resolve(editorText);
    case "editor.getText":
      return await Promise.resolve(editorText);
    default:
      throw Error(`Missing mock for: ${name}`);
  }
};
