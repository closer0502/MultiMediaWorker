export default function DebugDetails({ debug }) {
  if (!debug) {
    return null;
  }
  const printable = Object.entries(debug).filter(([, value]) => value !== undefined && value !== null);

  if (!printable.length) {
    return <p>デバッグ情報は返されませんでした。</p>;
  }

  return (
    <div className="debug-details">
      {printable.map(([key, value]) => {
        if (typeof value === 'string') {
          return (
            <details key={key} className="debug-block">
              <summary>{key}</summary>
              <pre>{value}</pre>
            </details>
          );
        }
        return (
          <details key={key} className="debug-block">
            <summary>{key}</summary>
            <pre>{JSON.stringify(value, null, 2)}</pre>
          </details>
        );
      })}
    </div>
  );
}
