// NOAH는 외부 서비스입니다. DB/노트 파일을 열거나 요청을 보내지 않습니다.
export function externalNoteUrl(concept) {
  if (!concept.externalUrl) return null;
  const url = new URL(concept.externalUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("노트 주소는 사용자 정보가 없는 HTTP(S) URL이어야 합니다.");
  return url.href;
}
