/** Jeton Google absent ou expiré : une nouvelle connexion (geste utilisateur) est nécessaire. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Session Google expirée : reconnectez-vous.');
    this.name = 'AuthExpiredError';
  }
}

/** Le fichier Drive a changé depuis la dernière synchronisation. */
export class ConflictError extends Error {
  constructor() {
    super('Le fichier a été modifié ailleurs depuis la dernière synchronisation.');
    this.name = 'ConflictError';
  }
}

export class DriveApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}
