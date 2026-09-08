# Presupuestos · validación accesible de campo

## Alcance test-first

Checkpoint `cf192bf340aed3a9b34f31e002bad35bc27609a3` añade una prueba específica para el editor de límite manual sin modificar todavía el producto.

La prueba exige que un importe ambiguo o inválido:

- no provoque ninguna escritura;
- marque el input con `aria-invalid="true"`;
- asocie el mensaje mediante `aria-describedby`;
- presente el error local con semántica de alerta;
- conserve o devuelva el foco al campo inválido;
- limpie el estado de validación al corregir el valor;
- mantenga el parser monetario español existente y envíe `1.234,56` como `123456` céntimos.

La implementación posterior no debe modificar el contrato de `/api/budgets`, el parser financiero ni la fuente bancaria.
