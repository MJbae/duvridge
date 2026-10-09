/** Match normal HTML whitespace without changing non-breaking spaces or paragraph boundaries. */
export const renderedText = text => text.replace(/[ \t\r\n\f]+/g, ' ').trim()
