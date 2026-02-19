function Card({ title, children, actions }) {
  return (
    <section className="card">
      {title && <h3>{title}</h3>}
      {children}
      {actions ? <div className="card-actions">{actions}</div> : null}
    </section>
  );
}

export default Card;