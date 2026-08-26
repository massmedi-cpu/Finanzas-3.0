export default function DesignPreviewPage(){
  const demoAccounts=[
    ["Cuenta principal","Operativa · saldo disponible","3.842,60 €"],
    ["Ahorro","Reserva y objetivos","8.250,00 €"],
    ["Tarjeta","Compras del mes","−486,35 €"],
  ];
  const pulse=[
    ["Ingresos","2.180,00 €","Este mes"],
    ["Gastos","−1.426,80 €","65 % de los ingresos"],
    ["Cash Flow","+753,20 €","Positivo"],
    ["Por revisar","4","Movimientos"],
    ["Conciliación","98 %","Datos verificados"],
    ["Alertas","2","Requieren atención"],
  ];
  return <main className="workspace home-workspace">
    <section className="home-masthead">
      <div><p className="eyebrow">PREVIEW VISUAL · REDISEÑO 2026</p><h1>Panorama financiero</h1><p>Una lectura continua de tu dinero: menos cajas, más jerarquía y contexto.</p></div>
      <div className="home-top-actions"><span>Datos de demostración · no son tus datos reales</span></div>
    </section>

    <section className="home-balance-story" aria-label="Resumen de saldos">
      <div className="home-balance-primary"><span>Disponible total</span><strong>11.606,25 €</strong><p>Actualizado hoy · tres cuentas</p><a href="#cuentas">Ver detalle de cuentas →</a></div>
      <div className="home-account-ledger" id="cuentas">
        {demoAccounts.map(([name,meta,balance])=><a className="home-account-row" href="#cuentas" key={name}><div><strong>{name}</strong><small>{meta}</small></div><div className="home-account-balance"><strong>{balance}</strong><small>Saldo actual</small></div></a>)}
      </div>
    </section>

    <nav className="home-month-pulse" aria-label="Pulso del mes">
      {pulse.map(([label,value,note])=><a href="#movimiento" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></a>)}
    </nav>

    <section className="home-flow-section" id="movimiento">
      <div className="home-section-heading"><div><p className="eyebrow">AGOSTO</p><h2>Cómo se está moviendo tu dinero</h2><p>Los ingresos siguen por encima del gasto. La lectura principal es el flujo, no una colección de widgets.</p></div><a href="#movimiento">Abrir análisis →</a></div>
      <div className="home-flow-layout">
        <div className="home-chart-area" aria-label="Resumen visual de cash flow">
          <div style={{display:"grid",gap:"18px",padding:"22px 0",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)"}}>
            <div><small style={{color:"var(--muted)"}}>Ingresos</small><div style={{height:"10px",marginTop:"7px",background:"var(--surface-3)"}}><i style={{display:"block",height:"100%",width:"86%",background:"var(--success)"}} /></div></div>
            <div><small style={{color:"var(--muted)"}}>Gastos</small><div style={{height:"10px",marginTop:"7px",background:"var(--surface-3)"}}><i style={{display:"block",height:"100%",width:"56%",background:"var(--expense)"}} /></div></div>
            <div><small style={{color:"var(--muted)"}}>Ahorro neto</small><div style={{height:"10px",marginTop:"7px",background:"var(--surface-3)"}}><i style={{display:"block",height:"100%",width:"30%",background:"var(--accent)"}} /></div></div>
          </div>
        </div>
        <aside className="home-budget-context"><p className="eyebrow">PRESUPUESTO</p><h3>Contexto del mes</h3><dl><div><dt>Gastado</dt><dd>1.426,80 €</dd></div><div><dt>Disponible</dt><dd>773,20 €</dd></div><div><dt>Uso</dt><dd>64,9 %</dd></div></dl><div className="home-budget-bar"><i style={{width:"65%"}} /></div><p>El ritmo de gasto está dentro de lo previsto.</p></aside>
      </div>
    </section>

    <section className="home-forecast-section">
      <div className="home-section-heading"><div><p className="eyebrow">PRÓXIMOS DÍAS</p><h2>Lo que viene</h2><p>Previsión integrada en la misma lectura financiera.</p></div></div>
      <div className="home-forecast-line"><div><span>Saldo previsto</span><strong>10.982,40 €</strong></div><div><span>Impacto próximo</span><strong>−623,85 €</strong></div></div>
      <div className="home-upcoming"><div><span>28 ago</span><strong>Electricidad</strong><b>−67,40 €</b></div><div><span>01 sep</span><strong>Vivienda</strong><b>−556,45 €</b></div></div>
    </section>

    <section className="home-decision-grid">
      <div><div className="home-section-heading compact"><div><p className="eyebrow">GASTO</p><h2>En qué se concentra</h2></div></div><div className="home-category-list"><a href="#categorias"><span><strong>Vivienda</strong><small>Principal categoría</small></span><b>556,45 €</b><i><span style={{width:"72%"}} /></i></a><a href="#categorias"><span><strong>Alimentación</strong><small>Compra habitual</small></span><b>318,20 €</b><i><span style={{width:"43%"}} /></i></a><a href="#categorias"><span><strong>Transporte</strong><small>Movilidad</small></span><b>146,70 €</b><i><span style={{width:"22%"}} /></i></a></div></div>
      <aside className="home-attention-section"><div className="home-section-heading compact"><div><p className="eyebrow">ATENCIÓN</p><h2>Qué necesita revisión</h2></div></div><div className="home-attention-list"><a href="#atencion"><span>Movimientos sin categoría</span><strong>4</strong></a><a href="#atencion"><span>Alertas activas</span><strong>2</strong></a><a href="#atencion"><span>Conciliación pendiente</span><strong>1</strong></a></div></aside>
    </section>
    <footer className="home-freshness"><span>Preview visual aislada · sin acceso a información financiera real</span><span>Financial App · rediseño 2026</span></footer>
  </main>;
}
