/** Chargeur de bibliothèques Google (`https://apis.google.com/js/api.js`), utilisé uniquement pour le Picker. */
declare const gapi: {
  load(api: string, options: { callback: () => void; onerror: () => void }): void;
};
