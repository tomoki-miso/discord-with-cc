export const ALLOWED_BASH_PREFIXES = [
  "npm run ",
  "npx tsc ",
  "npx vitest ",
  "node ",
  "tsx ",
  "git status",
  "git diff ",
  "git log ",
  "git add ",
  "git commit ",
  "git branch ",
  "git checkout ",
  "git stash ",
  "ls",
  "cat ",
  "head ",
  "tail ",
  "wc ",
  "find ",
  "grep ",
  "mkdir ",
  "cp ",
  "mv ",
];

export const DENIED_BASH_PATTERNS = ["rm -rf", "git push", "curl ", "wget ", ".env"];

export function isBashAllowed(command: string): boolean {
  // Deny list checked first
  if (DENIED_BASH_PATTERNS.some((pattern) => command.includes(pattern))) {
    return false;
  }
  // Allow only commands matching an allowed prefix
  return ALLOWED_BASH_PREFIXES.some((prefix) => {
    if (prefix.endsWith(" ")) {
      return command.startsWith(prefix);
    }
    // No trailing space: match exact command or command followed by a space
    return command === prefix || command.startsWith(prefix + " ");
  });
}
