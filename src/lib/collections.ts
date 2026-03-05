export class DefaultMap<K, V> extends Map<K, V> {
    constructor(private defaultFactory: () => V, entries?: readonly (readonly [K, V])[] | null) {
        super(entries);
    }

    get(key: K): V {
        if (!this.has(key)) {
            this.set(key, this.defaultFactory());
        }
        return super.get(key)!;
    }
}
