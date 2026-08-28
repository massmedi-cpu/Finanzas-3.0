import { formatInteger } from "@/lib/format/es-es";
import type { MatchingCalibration } from "@/lib/financial/document-matching-calibration";

const percents=new Intl.NumberFormat("es-ES",{style:"percent",maximumFractionDigits:0});
const percent=(value:number)=>percents.format(Math.max(0,Math.min(1,value)));
const bandLabel=(value:string)=>value==="100"?"100":value==="93-99"?"93–99":value==="75-92"?"75–92":value==="60-74"?"60–74":"< 60";

export function DocumentMatchingCalibrationPanel({data}:{data:MatchingCalibration}){
  const s=data.summary;
  const hasDecisions=s.accepted>0;
  const hasSuggested=s.withSuggestions>0;
  return <section className="document-matching-calibration" aria-labelledby="document-matching-calibration-title">
    <div className="matching-quality-head">
      <div>
        <p className="eyebrow">CALIBRACIÓN REAL · {formatInteger(data.windowDays)} DÍAS</p>
        <h2 id="document-matching-calibration-title">Qué aprende el ranking de tus decisiones</h2>
        <p>Compara la primera propuesta con la asociación que realmente eliges. Solo conserva señales estadísticas del ranking; no guarda importes, comercios ni identificadores financieros.</p>
      </div>
      <span className="document-calibration-privacy">Sin datos financieros</span>
    </div>

    {!hasDecisions?<div className="document-matching-empty"><strong>Aún no hay decisiones para calibrar</strong><span>Cuando asocies documentos desde Archivo, aquí aparecerá si la primera propuesta acierta, si eliges una alternativa o si descartas el ranking.</span></div>:<>
      <div className="document-calibration-summary">
        <div><span>Decisiones</span><strong>{formatInteger(s.accepted)}</strong><small>{percent(s.suggestionCoverageRate)} con sugerencias</small></div>
        <div><span>Top elegido</span><strong>{hasSuggested?percent(s.topChoiceRate):"—"}</strong><small>{formatInteger(s.topChosen)} de {formatInteger(s.withSuggestions)}</small></div>
        <div><span>Alternativa / externa</span><strong>{formatInteger(s.alternativeChosen+s.outsideSuggestions)}</strong><small>{formatInteger(s.alternativeChosen)} alternativa · {formatInteger(s.outsideSuggestions)} fuera</small></div>
        <div><span>Reversiones</span><strong>{formatInteger(s.reverted)}</strong><small>Vínculos deshechos</small></div>
      </div>

      {s.autoEligibleCases>0&&<div className={`document-calibration-safety ${s.autoEligibleRejected>0?"needs-attention":"safe"}`}>
        <div><strong>Precisión de autoelegibles</strong><span>{percent(s.autoEligibleAcceptanceRate)} sobre {formatInteger(s.autoEligibleCases)} decisiones comparables.</span></div>
        {s.autoEligibleRejected>0?<p><b>{formatInteger(s.autoEligibleRejected)}</b> caso{s.autoEligibleRejected===1?"":"s"} cumplía el umbral automático pero no se eligió como primera opción. El sistema debe mantener o endurecer el criterio, nunca relajarlo automáticamente.</p>:<p>No hay señales de falso positivo entre las decisiones autoelegibles observadas.</p>}
      </div>}

      {data.scoreBands.length>0&&<div className="document-calibration-bands" role="table" aria-label="Precisión observada por banda de score">
        <div className="document-calibration-band labels" role="row"><span role="columnheader">Score top</span><span role="columnheader">Decisiones</span><span role="columnheader">Top elegido</span><span role="columnheader">Precisión</span></div>
        {data.scoreBands.map(row=><div className="document-calibration-band" role="row" key={row.band}><span role="cell">{bandLabel(row.band)}</span><span role="cell">{formatInteger(row.decisions)}</span><span role="cell">{formatInteger(row.topChosen)}</span><span role="cell">{percent(row.topChoiceRate)}</span></div>)}
      </div>}
    </>}

    <p className="document-calibration-policy">Privacidad: {data.rules.noFinancialValuesStored&&data.rules.noEntityIdsStored?"solo se guardan bandas y resultados anónimos; no se almacenan valores financieros ni IDs de entidades.":"contrato de privacidad no verificado."} Los umbrales se analizan, pero no se modifican automáticamente.</p>
  </section>;
}
