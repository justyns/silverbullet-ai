import { editor } from "@silverbulletmd/silverbullet/syscalls";

/**
 * Port of SilverBullet's `panelStyles()`. Not imported from
 * `@silverbulletmd/silverbullet/ui` because that barrel re-exports .tsx
 * components the npm package's `files` list doesn't publish (2.10.0).
 *
 * The stylesheet path must stay relative: panel iframes are served with
 * <base href="{{.HostPrefix}}">, and an absolute path 404s behind a URL prefix.
 */
async function panelStyles(): Promise<string> {
  let out = `<link rel="stylesheet" href=".client/components.css">`;
  const customStyles = await editor.getUiOption("customStyles");
  if (typeof customStyles === "string" && customStyles) {
    out += customStyles;
  }
  return out;
}

export async function showPanel(
  slot: "rhs" | "modal",
  html: string,
  script = "",
): Promise<void> {
  await editor.showPanel(
    slot,
    slot === "modal" ? 20 : 1,
    (await panelStyles()) + html,
    script,
  );
}
