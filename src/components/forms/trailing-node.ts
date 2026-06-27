import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

export const TrailingNode = Extension.create({
    name: 'trailingNode',

    addOptions() {
        return {
            node: 'paragraph',
            notAfter: ['paragraph'],
        };
    },

    addProseMirrorPlugins() {
        const plugin = new PluginKey(this.name);
        const disabledNodes = this.options.notAfter;

        return [
            new Plugin({
                key: plugin,
                appendTransaction: (_, __, state) => {
                    const { doc, tr, schema } = state;
                    const shouldInsertNodeAtEnd = plugin.getState(state);
                    const endPosition = doc.content.size;
                    const type = schema.nodes[this.options.node];

                    if (!shouldInsertNodeAtEnd) {
                        return;
                    }

                    return tr.insert(endPosition, type.create());
                },
                state: {
                    init: (_, state) => {
                        const lastNode = state.doc.lastChild;
                        return !disabledNodes.includes(lastNode?.type.name);
                    },
                    apply: (tr, value, oldState, state) => {
                        if (!tr.docChanged) {
                            return value;
                        }

                        const lastNode = state.doc.lastChild;
                        return !disabledNodes.includes(lastNode?.type.name);
                    },
                },
            }),
        ];
    },
});
