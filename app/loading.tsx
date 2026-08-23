export default function Loading(){
  return <main className="route-loading-v300" aria-busy="true" aria-label="Cargando contenido">
    <div className="loading-head" aria-hidden="true"><b/><span/></div>
    <div className="loading-grid" aria-hidden="true">
      <span className="loading-block"/><span className="loading-block"/><span className="loading-block"/>
      <span className="loading-block loading-panel"/>
    </div>
    <span className="sr-only" role="status">Actualizando la vista. Tus datos no se están modificando.</span>
  </main>;
}
