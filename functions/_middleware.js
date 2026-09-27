import { route } from "../src/router.js";

export const onRequest = (context) => route(context.request, () => context.next());
