function parseJson(json: string): Record<string, string> {
  return JSON.parse(json.trim()) as Record<string, string>;
}

export function extractEnvObjectValue(envFileContent: string, key: string): string | null {
  const lines = envFileContent.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));

  if (startIndex === -1) {
    return null;
  }

  const firstLine = lines[startIndex]!;
  const initialValue = firstLine.slice(firstLine.indexOf("=") + 1).trimStart();

  if (!initialValue.startsWith("{")) {
    return null;
  }

  const collected = [initialValue];

  if (initialValue.trimEnd().endsWith("}")) {
    return collected[0]!;
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const nextLine = lines[index]!;
    collected.push(nextLine);

    if (nextLine.trim() === "}") {
      return collected.join("\n");
    }
  }

  return null;
}

export function parseServiceAccountJson(
  serviceAccountJson: string,
  envFileContent?: string
): Record<string, string> {
  try {
    return parseJson(serviceAccountJson);
  } catch (initialError) {
    if (!envFileContent) {
      throw initialError;
    }

    const extracted = extractEnvObjectValue(envFileContent, "FIREBASE_ADMIN_SDK_JSON");

    if (!extracted) {
      throw initialError;
    }

    return parseJson(extracted);
  }
}
