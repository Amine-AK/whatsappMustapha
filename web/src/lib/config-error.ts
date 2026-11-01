/** A missing or wrong environment variable (shown to the user by name, never its value). */
export class ConfigError extends Error {
  constructor(readonly variable: string, message: string) {
    super(message);
  }
}
