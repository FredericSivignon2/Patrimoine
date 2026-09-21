export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Contenu stocké illisible ou d'un format inattendu. */
export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDataError';
  }
}
