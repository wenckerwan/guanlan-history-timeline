export async function openDatabase(name: string, storeName: string): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error('IndexedDB 不可用，无法持久保存或恢复本地记录');
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = globalThis.indexedDB.open(name, 1); }
    catch { reject(new Error('IndexedDB 打开失败，无法持久保存本地记录')); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onerror = () => reject(new Error('IndexedDB 打开失败，无法持久保存本地记录'));
    request.onblocked = () => reject(new Error('IndexedDB 被其他页面阻塞，请关闭旧页面后重试'));
    request.onsuccess = () => resolve(request.result);
  });
}

/** The read and its dependent write share one transaction, including across tabs. */
export async function accessRecord<T>(name: string, storeName: string, key: string, mode: IDBTransactionMode, transform: (value: unknown, store: IDBObjectStore) => T): Promise<T> {
  const database = await openDatabase(name, storeName);
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = database.transaction(storeName, mode); }
    catch { database.close(); reject(new Error('IndexedDB 事务启动失败，本地记录未保存')); return; }
    let result: T;
    let failure: unknown;
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onabort = () => { database.close(); reject(failure ?? new Error('IndexedDB 事务失败，本地记录未保存')); };
    transaction.onerror = () => { failure ??= new Error('IndexedDB 读写失败，本地记录未保存'); };
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => {
      try { result = transform(request.result, store); }
      catch (error) {
        failure = error instanceof DOMException ? new Error(`IndexedDB 写入失败（${error.name}），本地记录未保存`) : error;
        transaction.abort();
      }
    };
  });
}
