export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? 'brand-large' : ''}`}>
      <img
        className="brand-symbol"
        src="/mark.svg"
        width="40"
        height="40"
        alt=""
        aria-hidden="true"
      />
      <div>
        <strong>
          TuiClean<span>推净</span>
        </strong>
        <small>让信息流清净一点</small>
      </div>
    </div>
  );
}
