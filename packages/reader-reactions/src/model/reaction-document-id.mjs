/** Bare numbered/special episode IDs were published before works had their own scope. */
export const storedPageId = pageId => /^(?:prolog|ep[0-9]+|epilog|side)$/.test(pageId) ? `memoir-${pageId}` : pageId
