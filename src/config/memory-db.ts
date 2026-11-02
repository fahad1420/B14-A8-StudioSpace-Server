import { ObjectId } from "mongodb";

class MemoryCursor<T extends { [key: string]: any }> {
  private items: T[];

  constructor(items: T[]) {
    this.items = [...items];
  }

  sort(sortSpec: { [key: string]: number }): this {
    const keys = Object.keys(sortSpec);
    if (keys.length === 0) return this;

    this.items.sort((a, b) => {
      for (const key of keys) {
        const order = sortSpec[key];
        const valA = a[key];
        const valB = b[key];
        if (valA < valB) return order === 1 ? -1 : 1;
        if (valA > valB) return order === 1 ? 1 : -1;
      }
      return 0;
    });
    return this;
  }

  limit(n: number): this {
    if (n > 0) {
      this.items = this.items.slice(0, n);
    }
    return this;
  }

  async toArray(): Promise<T[]> {
    return this.items.map((item) => ({ ...item }));
  }
}

export class MemoryCollection<T extends { [key: string]: any }> {
  private data: Map<string, T> = new Map();
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  private matchesQuery(doc: T, query: any): boolean {
    if (!query || Object.keys(query).length === 0) return true;

    for (const [key, expected] of Object.entries(query)) {
      if (key === "$or" && Array.isArray(expected)) {
        const anyMatch = expected.some((subQuery) => this.matchesQuery(doc, subQuery));
        if (!anyMatch) return false;
        continue;
      }

      if (key === "_id") {
        const docId = doc._id ? doc._id.toString() : (doc as any).id;
        const expObj = expected as any;
        if (expObj && typeof expObj === "object" && expObj.$ne) {
          const neId = expObj.$ne.toString();
          if (docId === neId) return false;
          continue;
        }
        if (expObj && typeof expObj === "object" && expObj.$in) {
          const inIds = expObj.$in.map((i: any) => i.toString());
          if (!inIds.includes(docId)) return false;
          continue;
        }
        const expId = expected ? expected.toString() : "";
        if (docId !== expId) return false;
        continue;
      }

      const docVal = doc[key];
      const expAny = expected as any;

      // Handle RegExp
      if (expected instanceof RegExp) {
        if (!expected.test(String(docVal || ""))) return false;
        continue;
      }

      // Handle $regex
      if (expAny && typeof expAny === "object" && expAny.$regex) {
        const re = expAny.$regex instanceof RegExp ? expAny.$regex : new RegExp(expAny.$regex, "i");
        if (!re.test(String(docVal || ""))) return false;
        continue;
      }

      // Handle $gte, $lte
      if (expAny && typeof expAny === "object" && (expAny.$gte !== undefined || expAny.$lte !== undefined)) {
        const numVal = Number(docVal);
        if (expAny.$gte !== undefined && numVal < expAny.$gte) return false;
        if (expAny.$lte !== undefined && numVal > expAny.$lte) return false;
        continue;
      }

      // Handle $ne
      if (expAny && typeof expAny === "object" && expAny.$ne !== undefined) {
        if (docVal === expAny.$ne) return false;
        continue;
      }

      // Handle $in
      if (expAny && typeof expAny === "object" && Array.isArray(expAny.$in)) {
        const inVals = expAny.$in.map((v: any) => (v ? v.toString() : ""));
        const docValStr = docVal ? docVal.toString() : "";
        if (!inVals.includes(docValStr) && !expAny.$in.includes(docVal)) return false;
        continue;
      }

      // Handle ObjectId / string equality comparison
      if (docVal instanceof ObjectId || (docVal && typeof (docVal as any).toHexString === "function")) {
        if (docVal.toString() !== String(expected)) return false;
        continue;
      }
      if (expected instanceof ObjectId || (expected && typeof (expected as any).toHexString === "function")) {
        if (String(docVal) !== expected.toString()) return false;
        continue;
      }

      if (docVal !== expected) {
        if (docVal != null && expected != null && String(docVal) === String(expected)) {
          continue;
        }
        return false;
      }
    }

    return true;
  }

  find(query: any = {}): MemoryCursor<T> {
    const results: T[] = [];
    for (const doc of this.data.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(doc);
      }
    }
    return new MemoryCursor<T>(results);
  }

  async findOne(query: any = {}): Promise<T | null> {
    for (const doc of this.data.values()) {
      if (this.matchesQuery(doc, query)) {
        return { ...doc };
      }
    }
    return null;
  }

  async insertOne(doc: any): Promise<{ insertedId: ObjectId; acknowledged: boolean }> {
    const id = doc._id || new ObjectId();
    const newDoc = { ...doc, _id: id };
    if (!newDoc.id && typeof id.toString === "function") {
      newDoc.id = id.toString();
    }
    this.data.set(id.toString(), newDoc);
    return { insertedId: id, acknowledged: true };
  }

  async insertMany(docs: any[]): Promise<{ insertedCount: number; acknowledged: boolean }> {
    for (const doc of docs) {
      await this.insertOne(doc);
    }
    return { insertedCount: docs.length, acknowledged: true };
  }

  async updateOne(query: any, update: any): Promise<{ modifiedCount: number; matchedCount: number }> {
    const doc = await this.findOne(query);
    if (!doc) return { modifiedCount: 0, matchedCount: 0 };

    const docId = doc._id.toString();
    const existing = this.data.get(docId);
    if (!existing) return { modifiedCount: 0, matchedCount: 0 };

    if (update.$set) {
      Object.assign(existing, update.$set);
    }
    this.data.set(docId, existing);
    return { modifiedCount: 1, matchedCount: 1 };
  }

  async deleteOne(query: any): Promise<{ deletedCount: number; acknowledged: boolean }> {
    const doc = await this.findOne(query);
    if (!doc) return { deletedCount: 0, acknowledged: true };

    const docId = doc._id.toString();
    this.data.delete(docId);
    return { deletedCount: 1, acknowledged: true };
  }

  async deleteMany(query: any = {}): Promise<{ deletedCount: number; acknowledged: boolean }> {
    let deletedCount = 0;
    for (const [id, doc] of Array.from(this.data.entries())) {
      if (this.matchesQuery(doc, query)) {
        this.data.delete(id);
        deletedCount++;
      }
    }
    return { deletedCount, acknowledged: true };
  }

  aggregate(pipeline: any[] = []): { toArray: () => Promise<T[]> } {
    return {
      toArray: async () => {
        let results = Array.from(this.data.values()).map((item) => ({ ...item }));
        for (const stage of pipeline) {
          if (stage.$match) {
            results = results.filter((doc) => this.matchesQuery(doc, stage.$match));
          }
          if (stage.$limit) {
            results = results.slice(0, stage.$limit);
          }
        }
        return results;
      },
    };
  }

  async countDocuments(query: any = {}): Promise<number> {
    let count = 0;
    for (const doc of this.data.values()) {
      if (this.matchesQuery(doc, query)) {
        count++;
      }
    }
    return count;
  }

  async createIndex(spec: any, options: any = {}): Promise<string> {
    return "index_created";
  }
}

export class MemoryDatabase {
  private collections: Map<string, MemoryCollection<any>> = new Map();

  collection<T extends { [key: string]: any } = any>(name: string): MemoryCollection<T> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MemoryCollection<T>(name));
    }
    return this.collections.get(name)!;
  }
}
