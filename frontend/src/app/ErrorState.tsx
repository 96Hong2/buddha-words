/** 앱이 통째로 죽었을 때만 보이는 마지막 화면. 도메인 화면의 빈 상태와는 다르다 */
export function ErrorState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="errorstate" role="alert">
      <p className="errorstate__title">{title}</p>
      {description != null && <p className="errorstate__desc">{description}</p>}
      {actionLabel != null && onAction != null && (
        <button type="button" className="errorstate__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
