export const getContentUnavailableMessage = (reason?: string | null) => {
  switch (reason) {
    case "saij_friendly_500":
      return "La fuente oficial no devolvio el texto completo para este documento.";
    case "saij_document_only_metadata":
      return "Solo hay metadata disponible para este documento.";
    case "saij_metadata_only":
      return "Solo hay metadata disponible para este documento.";
    case "saij_timeout":
      return "La fuente tardo demasiado en responder.";
    case "saij_blocked":
      return "La fuente oficial bloqueo temporalmente el acceso.";
    case "blocked_html":
    case "consent_page":
      return "La fuente oficial bloqueo temporalmente el acceso.";
    case "redirect_page":
      return "La fuente oficial redirigio la solicitud y no pudimos leer el contenido.";
    case "html_without_extractable_main_content":
      return "No pudimos extraer el contenido principal del documento.";
    case "fallback_fetch_failed":
      return "No pudimos recuperar el contenido completo en este momento.";
    default:
      return "No pudimos obtener el contenido completo, pero podes abrir la fuente oficial.";
  }
};

export const sanitizeHtml = (html: string) => {
  const withoutA11y = html.replace(
    /\s+(aria-[a-zA-Z-]+|role|contenteditable|draggable|spellcheck|translate|hidden)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
    ""
  );
  return withoutA11y.replace(
    /\s+[^\s=]+=\s*(?:"(?:true|false)"|'(?:true|false)'|(?:true|false))/gi,
    ""
  );
};

export const htmlToText = (html: string) => {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
};
