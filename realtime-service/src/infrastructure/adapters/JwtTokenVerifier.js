import jwt from 'jsonwebtoken';
import { ITokenVerifier } from '../../domain/ports/ITokenVerifier.js';

export class JwtTokenVerifier extends ITokenVerifier {
  #secret;

  constructor(secret) {
    super();
    this.#secret = secret;
  }

  verify(token) {
    return jwt.verify(token, this.#secret);
  }
}
