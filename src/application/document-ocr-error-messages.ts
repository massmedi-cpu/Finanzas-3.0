/** Human-readable, privacy-safe OCR diagnostics. Never echo remote error text. */
export const GENERIC_OCR_FAILURE = "No se ha podido completar la lectura OCR de este documento.";

const OCR_FAILURE_LABELS: Readonly<Record<string, string>> = Object.freeze({
    ocr_google_drive_file_id_missing: "Este documento de Drive no conserva un identificador de archivo válido y no puede leerse de forma segura.",
    google_drive_document_access_denied: "Financial App Reader todavía no tiene acceso de lectura al archivo original. La carpeta Documentos debe compartirse explícitamente en modo lector antes de usar OCR de Drive.",
    google_drive_document_not_found: "El archivo original ya no existe en Drive o dejó de estar visible para Financial App Reader.",
    google_drive_document_metadata_invalid: "Drive no ha devuelto metadatos íntegros del archivo original; la lectura se ha detenido.",
    google_drive_document_source_changed: "El archivo original ha cambiado en Google Drive durante la lectura. No se ha guardado ninguna revisión mezclada. Pulsa «Comprobar ahora» en Documentos y vuelve a analizar la versión actual.",
    google_drive_document_mime_mismatch: "El tipo real del archivo de Drive ya no coincide con el documento registrado.",
    google_drive_document_too_large: "El documento de Drive está vacío o supera el límite seguro de 15 MB para OCR.",
    google_drive_document_download_failed: "No se ha podido descargar temporalmente el archivo original desde Drive.",
    service_account_missing: "Falta la credencial gestionada de Financial App Reader en el entorno de ejecución.",
    service_account_invalid: "La credencial gestionada de Financial App Reader no coincide con la identidad autorizada.",
    service_account_scope_invalid: "El entorno ha intentado solicitar un permiso de Google no autorizado por el contrato de solo lectura.",
    service_account_token_request_failed: "Google no ha permitido iniciar la lectura gestionada de este documento.",
    service_account_token_response_invalid: "Google no ha devuelto un token de lectura válido para este documento.",
    ocr_document_identity_mismatch: "El servidor ha devuelto metadatos de otro documento o de un origen no verificable. No se ha realizado ninguna lectura OCR. Recarga Documentos y vuelve a comprobar el original.",
    ocr_source_download_failed: "No se ha podido descargar temporalmente el archivo privado para analizarlo.",
    ocr_source_too_large: "El documento supera el límite seguro de 15 MB para OCR.",
    ocr_image_dimensions_too_large: "La imagen tiene unas dimensiones demasiado grandes para procesarla de forma segura.",
    ocr_queue_timeout: "El motor OCR está ocupado. Puedes volver a intentarlo.",
    ocr_worker_timeout: "El motor OCR no ha podido iniciarse a tiempo.",
    ocr_recognize_timeout: "La lectura OCR ha superado el tiempo máximo de seguridad.",
    unsupported_ocr_mime_type: "Este formato todavía no admite OCR.",
    ocr_response_invalid: "La lectura terminó, pero la respuesta OCR no tiene el formato esperado. No se ha guardado ningún dato.",
  google_drive_document_id_invalid: "El identificador del archivo de Drive es inválido. Comprueba la asociación con el documento original antes de volver a analizar.",
  google_drive_document_content_mismatch: "El contenido descargado de Drive no coincide con la evidencia registrada. La lectura se ha detenido para evitar mezclar versiones.",
  invalid_ocr_file_size: "El archivo está vacío o supera el tamaño permitido para la lectura OCR (15 MB).",
  invalid_ocr_file_name: "El nombre del documento no es válido para esta lectura. Revisa el archivo original.",
  invalid_ocr_document_id: "No se ha podido identificar este documento con seguridad. Recarga Documentos antes de reintentarlo.",
  invalid_ocr_pages: "Las páginas detectadas no tienen una estructura válida. Comprueba el PDF o la imagen originales.",
  invalid_ocr_box: "La posición de uno de los fragmentos reconocidos no es válida. No se puede presentar la lectura como verificada.",
  ocr_provider_unsupported_mime: "El motor de reconocimiento no admite el formato real de este archivo. Conviértelo a PDF, JPG, PNG o WebP.",
  ocr_image_signature_mismatch: "El contenido del archivo no coincide con su formato de imagen declarado. Revisa el original.",
  ocr_source_mime_mismatch: "El contenido descargado no coincide con el formato registrado para el documento. No se ha utilizado para OCR.",
  InvalidPDFException: "El PDF está dañado o tiene una estructura que impide leerlo. Comprueba que se abre correctamente.",
  PasswordException: "El PDF está protegido con contraseña y no puede analizarse. Usa una copia autorizada sin protección.",
  not_found: "No se ha encontrado el documento original. Actualiza el listado y comprueba que sigue disponible.",
  gateway_error: "El servicio de documentos no ha devuelto una respuesta válida. Inténtalo más tarde sin repetir ninguna confirmación.",
  document_open_failed: "No se ha podido abrir el original de forma segura. Actualiza el documento y vuelve a intentarlo.",
  ocr_failed: "No se ha podido completar la lectura OCR. Comprueba el documento original antes de reintentarlo.",
});

export function documentOcrErrorMessage(code: unknown): string {
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(OCR_FAILURE_LABELS, code)) {
    return GENERIC_OCR_FAILURE;
  }
  return OCR_FAILURE_LABELS[code];
}
