class StorageAdapter {
  constructor() {
    if (new.target === StorageAdapter) {
      throw new TypeError("Cannot construct Abstract instances directly");
    }
  }

  addRecord(record) {
    throw new Error("Must override method");
  }

  getHistory() {
    throw new Error("Must override method");
  }

  limitHistorySize(maxSize) {
    throw new Error("Must override method");
  }

  updateRecord(index, updatedRecord) {
      throw new Error("Must override method");
  }
}

class CookiesAdapter extends StorageAdapter {
  addRecord(record) {
    let history = this.getHistory();
    history.push(record);
    this.limitHistorySize(10, history);
    Cookies.set('history', JSON.stringify(history), { expires: 365 });
  }

  getHistory() {
    const historyCookie = Cookies.get('history');
    return historyCookie ? JSON.parse(historyCookie) : [];
  }

  limitHistorySize(maxSize, history) {
    while (history.length > maxSize) {
      history.shift();
    }
  }

  updateRecord(index, updatedRecord) {
      let history = this.getHistory();
      history[index] = updatedRecord;
      Cookies.set('history', JSON.stringify(history), { expires: 365 });
  }
}

class LocalStorageAdapter extends StorageAdapter {
  addRecord(record) {
    let history = this.getHistory();
    history.push(record);
    this.limitHistorySize(10, history);
    localStorage.setItem('history', JSON.stringify(history));
  }

  getHistory() {
    return JSON.parse(localStorage.getItem('history')) || [];
  }

  limitHistorySize(maxSize, history) {
    while (history.length > maxSize) {
      history.shift();
    }
  }

  updateRecord(index, updatedRecord) {
      let history = this.getHistory();
      history[index] = updatedRecord;
      localStorage.setItem('history', JSON.stringify(history));
  }
}
class SessionStorageAdapter extends StorageAdapter {
  addRecord(record) {
    let history = this.getHistory();
    history.push(record);
    this.limitHistorySize(10, history);
    sessionStorage.setItem('history', JSON.stringify(history));
  }

  getHistory() {
    const historySessionStorage = sessionStorage.getItem('history');
    return historySessionStorage ? JSON.parse(historySessionStorage) : [];
  }

  limitHistorySize(maxSize, history) {
    while (history.length > maxSize) {
      history.shift();
    }
  }

  updateRecord(index, updatedRecord) {
    let history = this.getHistory();
    history[index] = updatedRecord;
    sessionStorage.setItem('history', JSON.stringify(history));
  }
}

class IndexedDBAdapter extends StorageAdapter {
  constructor() {
    super();
    this.dbName = 'RefreshHistoryDB';
    this.storeName = 'history';
    this.db = null;
    this.openDatabase();
  }

  async openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject("Can't open IndexedDB");
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

async addRecord(record) {
  while (!this.db) {
    await this.openDatabase();
  }
  return new Promise((resolve, reject) => {
    const transaction = this.db.transaction(this.storeName, 'readwrite');
    const objectStore = transaction.objectStore(this.storeName);
    const request = objectStore.add(record);
    request.onerror = () => reject("Can't add record");
    request.onsuccess = async () => {
      await this.limitHistorySize(10);
      resolve(record);
    };
  });
}


  async getHistory() {
    while (!this.db) {
      await this.openDatabase();
    }
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();
      request.onerror = () => reject("Can't get history");
      request.onsuccess = () => resolve(request.result);
    });
  }

  async limitHistorySize(maxSize) {
    while (!this.db) {
      await this.openDatabase();
    }
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onerror = () => reject("Can't get history");
      request.onsuccess = () => {
        const records = request.result;
        if (records.length > maxSize) {
          records.sort((a, b) => a.id - b.id);
          for (let i = 0; i < records.length - maxSize; i++) {
            objectStore.delete(records[i].id);
          }
        }
        resolve();
      };
    });
  }


  async updateRecord(id, updatedRecord) {
    while (!this.db) {
      await this.openDatabase();
    }
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put({ ...updatedRecord, });
      request.onerror = () => reject("Can't update record");
      request.onsuccess = () => resolve(updatedRecord);
    });
  }

}

class StorageManager {
  constructor(adapter) {
    if (!(adapter instanceof StorageAdapter)) {
      throw new Error("Adapter must be an instance of StorageAdapter");
    }
    this.adapter = adapter;
  }

  addRecord(record) {
    return this.adapter.addRecord(record);
  }

  getHistory() {
    return this.adapter.getHistory();
  }

  updateRecord(index, updatedRecord) {
    return this.adapter.updateRecord(index, updatedRecord);
  }
}
async function getIP() {
  const response = await fetch('https://api.ipify.org?format=json');
  const data = await response.json();
  return data.ip;
}

new Vue({
    el: '#app',
    data: {
        plugins: [
          { name: "Cookies",        adapter: CookiesAdapter },
          { name: "LocalStorage",   adapter: LocalStorageAdapter },
          { name: "SessionStorage", adapter: SessionStorageAdapter },
          { name: "IndexedDB",      adapter: IndexedDBAdapter },
        ],
        histories: {},
        activeTab: null  // activeTab will be set in the 'created' lifecycle hook
    },
    methods: {
        formatTime(seconds) {
            const ms = seconds % 1;
            seconds = (seconds - ms) | 0;
            const days = Math.floor(seconds / (24*60*60));
            seconds %= 24*60*60;
            const hours = Math.floor(seconds / (60*60));
            seconds %= 60*60;
            const minutes = Math.floor(seconds / 60);
            seconds %= 60;

            return (days ? days + 'd ' : '') +
            (hours ? hours + 'h ' : '') +
            (minutes ? minutes + 'm ' : '') +
            (seconds ? seconds + '' : '') +
            (ms.toFixed(3)).substring(1)
        },
        setActiveTab(tabName) {
            this.activeTab = tabName;
            Cookies.set('activeTab', tabName, { expires: 365 });  // expires in 365 days
        },
        async loadHistory() {
          // Load data from storage first
          let tempHistories = {};
          for (const plugin of this.plugins) {
              const manager = new StorageManager(new plugin.adapter());
              tempHistories[plugin.name] = await manager.getHistory(); // Обратите внимание на добавление await здесь
          }
          this.histories = tempHistories;
        },
        async addNewRecord() {
          let tempHistories = {};
          // Add a new record
          for (const plugin of this.plugins) {
            const manager = new StorageManager(new plugin.adapter());
            const history = await manager.getHistory(); // Await here
            const now = new Date();
            const timeElapsed = history.length > 0 ? now - new Date(history[history.length - 1]?.rawTime) : 0;
            const id = history.length > 0 ? history[history.length - 1].id + 1 : 1;

            // Add a record without IP first
            await manager.addRecord({id: id, time: now.toLocaleString(), rawTime: now.toISOString(), ip: null, timeElapsed: timeElapsed}); // Await here
            tempHistories[plugin.name] = await manager.getHistory(); // Await here
          }
          this.histories = tempHistories;
        },
        async updateIP() {
          await this.addNewRecord();
          // fetch the IP
          const ip = await getIP();
          let tempHistories = {};
          // Update the last record with the fetched IP
          for (const plugin of this.plugins) {
            const manager = new StorageManager(new plugin.adapter());
            const history = await manager.getHistory(); // Await here
            const lastRecordIndex = history.length - 1;
            const lastRecord = history[lastRecordIndex];

            // Update the record with IP
            await manager.updateRecord(lastRecordIndex, {...lastRecord, ip: ip}); // Await here
            tempHistories[plugin.name] = await manager.getHistory(); // Await here
          }
          this.histories = tempHistories;
        },
    },
    created: function() {
        // Load history from storage and render table
        this.loadHistory();

        const activeTabCookie = Cookies.get('activeTab');
        if (activeTabCookie) {
            this.activeTab = activeTabCookie;
        } else if (this.plugins.length > 0) {
            this.activeTab = this.plugins[0].name; // Установить activeTab в первый плагин
        }

        // Update data with new IP and re-render table
        this.updateIP();
    }
});
