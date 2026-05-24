import "../../chunks/dev.js";
//#region src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	let { children } = $$props;
	$$renderer.push(`<div class="app svelte-12qhfyh"><main class="svelte-12qhfyh">`);
	children($$renderer);
	$$renderer.push(`<!----></main></div>`);
}
//#endregion
export { _layout as default };
