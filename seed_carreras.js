require('dotenv').config();

const crypto = require('crypto');
const { pool } = require('./src/config/db');

// Pensum oficial: carreras con sus materias por periodo.
//   npm run seed-carreras
// Se puede ejecutar varias veces: solo crea las carreras y materias que falten.

// Cada periodo es una lista de [nombre, código oficial]
const CARRERAS = [
  {
    nombre: 'Idiomas Modernos',
    codigo: 'IM',
    periodos: [
      [
        ['Inglés I', 'ING-186IM'],
        ['Lengua Española I', 'LEE-133IM'],
        ['Idioma I', 'IDI-164IM FR-IT-PO'],
        ['Cultura y Actualidad', 'CUA-122IM'],
        ['Ecología Aplicada al Turismo', 'EAT-122IM'],
        ['Técnicas de Estudio', 'TEE-122IM'],
      ],
      [
        ['Inglés II', 'ING-286IM'],
        ['Lengua Española II', 'LEE-233IM'],
        ['Idioma II', 'IDI-264IM FR-IT-PO'],
        ['Cátedra Bolivariana', 'CAB-222IM'],
        ['Lingüística General I', 'LIG-233IM'],
        ['Protocolo', 'PRO-232IM'],
      ],
      [
        ['Inglés III', 'ING-386IM'],
        ['Fonética del Inglés', 'FIN-332IM'],
        ['Idioma III', 'IDI-364IM FR-IT-PO'],
        ['Fonética del Idioma', 'FOI-332IM'],
        ['Lingüística General II', 'LIG-333IM'],
        ['Introducción a la Administración', 'INA-322IM'],
      ],
      [
        ['Inglés IV', 'ING-486IM'],
        ['Panorama de la Cultura Angloparlante', 'PCA-433IM'],
        ['Idioma IV', 'IDI-464IM FR-IT-PO'],
        ['Iniciación a la Traducción', 'INT-432IM'],
        ['Didáctica General', 'DIG-432IM'],
        ['Metodología de la Investigación', 'MEI-422IM'],
      ],
      [
        ['Inglés V', 'ING-586IM'],
        ['Electiva I', 'EL1-543IM'],
        ['Electiva II', 'EL2-543IM'],
        ['Electiva III', 'EL3-543IM'],
        ['Proyecto de Investigación', 'PRI-522IM'],
        ['Servicio Comunitario', 'SEC-500IM'],
      ],
      [
        ['Trabajo de Grado', 'TEG-608IM'],
        ['Pasantías', 'PAS-605IM'],
      ],
    ],
  },
  {
    nombre: 'Turismo y Hotelería',
    codigo: 'TH',
    periodos: [
      [
        ['Inglés I', 'ING-164TH'],
        ['Cátedra Bolivariana', 'CAB-122TH'],
        ['Informática', 'INF-132TH'],
        ['Lenguaje y Comunicación', 'LEC-132TH'],
        ['Derecho y Legislación Turística', 'DLT-133TH'],
        ['Fundamentos Teóricos del Turismo I', 'FTT-144TH'],
        ['Técnicas de Estudio', 'TEI-122TH'],
      ],
      [
        ['Inglés II', 'ING-264TH'],
        ['Fundamentos de Economía', 'FUE-233TH'],
        ['Contabilidad', 'CON-243TH'],
        ['Recursos Territoriales Turísticos', 'RTT-254TH'],
        ['Estadística', 'EST-233TH'],
        ['Habilidades Blandas', 'HABB-222TH'],
      ],
      [
        ['Inglés III', 'ING-364TH'],
        ['Economía del Turismo', 'ECT-343TH'],
        ['Organización y Gestión de Empresas', 'OGE-343TH'],
        ['Patrimonio Cultural', 'PAC-344TH'],
        ['Protocolo y Etiqueta', 'PYE-332TH'],
        ['Electiva I', 'ELE-322TH'],
        ['Tráfico Aéreo Nacional', 'TAN-343TH'],
      ],
      [
        ['Inglés IV', 'ING-464TH'],
        ['Mercado Turístico y Hotelero', 'MTH-443TH'],
        ['Gestión de Alojamiento Turístico', 'GAT-443TH'],
        ['Ecología Aplicada al Turismo', 'EAT-443TH'],
        ['Animación y Recreación', 'ANR-443TH'],
        ['Electiva II', 'ELE-422TH'],
        ['Metodología de la Investigación', 'MEI-422TH'],
      ],
      [
        ['Inglés V', 'ING-564TH'],
        ['Turismo Internacional', 'TUI-554TH'],
        ['Hotelería', 'HOT-543TH'],
        ['Diseño de Rutas Turísticas', 'DRT-543TH'],
        ['Programación de Viajes', 'PRV-543TH'],
        ['Proyecto de Investigación', 'PRI-522TH'],
        ['Servicio Comunitario', 'SEC-500TH'],
      ],
      [
        ['Pasantías', 'PAS-605TH'],
        ['Trabajo de Grado', 'TEG-608TH'],
      ],
    ],
  },
  {
    nombre: 'Publicidad y Mercadeo',
    codigo: 'PM',
    periodos: [
      [
        ['Matemática I', 'MAT-143PM'],
        ['Lenguaje y Comunicación', 'LEC-132PM'],
        ['Inglés I', 'ING-143PM'],
        ['Publicidad I', 'PUB-132PM'],
        ['Introducción al Mercadeo', 'INM-132PM'],
        ['Técnicas de Estudio', 'TEE-122PM'],
        ['Habilidades Blandas', 'HABB-122PM'],
        ['Fundamentos de Economía', 'FUE-133PM'],
      ],
      [
        ['Matemática Financiera', 'MAF-243PM'],
        ['Estadística', 'EST-233PM'],
        ['Inglés II', 'ING-232PM'],
        ['Publicidad II', 'PUB-243PM'],
        ['Mercadotecnia I', 'MER-243PM'],
        ['Educación Ambiental', 'EDA-222PM'],
        ['Normativa Legal de Publicidad', 'NLP-233PM'],
      ],
      [
        ['Contabilidad', 'CON-343PM'],
        ['Diseño Gráfico Publicitario', 'DGP-332PM'],
        ['Técnicas Audiovisuales y Fotográficas', 'TAF-332PM'],
        ['Estrategia de Medios Publicitarios', 'EMP-332PM'],
        ['Mercadotecnia II', 'MER-343PM'],
        ['Comportamiento del Consumidor', 'COC-322PM'],
        ['Investigación de Mercado I', 'INM-332PM'],
        ['Sociología', 'SOC-322PM'],
      ],
      [
        ['Gerencia de Producto', 'GEP-443PM'],
        ['Creatividad e Innovación Publicitaria', 'CIP-432PM'],
        ['Gerencia de Ventas', 'GEV-443PM'],
        ['Estrategias de Mercadeo', 'ESM-443PM'],
        ['Mercadeo de Eventos', 'MEE-432PM'],
        ['Metodología de la Investigación', 'MEI-422PM'],
        ['Investigación de Mercado II', 'INM-432PM'],
        ['Social Media', 'SOM-443PM'],
      ],
      [
        ['Toma de Decisiones y Técnicas de Negociación', 'TDTN-522PM'],
        ['Electiva (Comunicaciones Integradas)', 'ELE-532PM'],
        ['Comercialización', 'COM-543PM'],
        ['Taller de Mercadeo', 'TAM-532PM'],
        ['Teoría de la Opinión', 'TEO-533PM'],
        ['Proyecto de Investigación', 'PRI-522PM'],
        ['Estrategia de Medios Digitales', 'EMD-533PM'],
      ],
      [
        ['Pasantías', 'PAS-605PM'],
        ['Trabajo de Grado', 'TEG-608PM'],
      ],
    ],
  },
  {
    nombre: 'Contaduría y Finanzas',
    codigo: 'CF',
    periodos: [
      [
        ['Matemática I', 'MAT-164CF'],
        ['Lenguaje y Comunicación', 'LEC-132CF'],
        ['Inglés I', 'ING-143CF'],
        ['Fundamentos de la Economía', 'FUE-133CF'],
        ['Informática I', 'INF-132CF'],
        ['Habilidades Blandas', 'HABB-122CF'],
        ['Técnicas de Estudio e Investigación', 'TEI-122CF'],
      ],
      [
        ['Matemática II', 'MAT-264CF'],
        ['Contabilidad I', 'CON-253CF'],
        ['Inglés II', 'ING-243CF'],
        ['Economía de la Empresa', 'ECE-232CF'],
        ['Informática II', 'INF-232CF'],
        ['Fundamentos de Derecho', 'FUD-222CF'],
        ['Educación Ambiental', 'EDA-222CF'],
      ],
      [
        ['Matemática Financiera', 'MAF-343CF'],
        ['Estadística I', 'EST-343CF'],
        ['Contabilidad II', 'CON-353CF'],
        ['Problemas del Desarrollo', 'PRD-322CF'],
        ['Introducción a la Administración', 'INA-333CF'],
        ['Legislación Fiscal y Mercantil', 'LFM-343CF'],
        ['Instituciones Financieras', 'IFI-332CF'],
      ],
      [
        ['Investigación de Operaciones', 'INO-443CF'],
        ['Estadística II', 'EST-443CF'],
        ['Contabilidad de Costos I', 'COC-443CF'],
        ['Finanzas Públicas', 'FIP-443CF'],
        ['Administración Financiera', 'ADF-432CF'],
        ['Presupuesto Empresarial', 'PRE-443CF'],
        ['Metodología de la Investigación', 'MEI-422CF'],
      ],
      [
        ['Auditoría', 'AUD-543CF'],
        ['Contabilidad Computarizada', 'CNC-532CF'],
        ['Contabilidad de Costos II', 'COC-543CF'],
        ['Análisis e Interpr. de Estados Financ.', 'AEF-543CF'],
        ['Control Presupuestario', 'COP-543CF'],
        ['Derecho y Legislación Laboral', 'DLL-522CF'],
        ['Proyecto de Investigación', 'PRI-522CF'],
        ['Servicio Comunitario', 'SEC-500CF'],
      ],
      [
        ['Trabajo de Grado', 'TEG-608CF'],
        ['Pasantías', 'PAS-605CF'],
      ],
    ],
  },
  {
    nombre: 'Administración Tributaria',
    codigo: 'AT',
    periodos: [
      [
        ['Matemática I', 'MAT-164AT'],
        ['Lenguaje y Comunicación', 'LEC-132AT'],
        ['Introducción a la Administración', 'INA-143AT'],
        ['Fundamentos de la Economía', 'FUE-144AT'],
        ['Habilidades Blandas', 'HABB-122AT'],
        ['Cátedra Bolivariana', 'CAB-122AT'],
        ['Técnicas de Estudio e Investigación', 'TEI-122AT'],
      ],
      [
        ['Estadística', 'EST-253AT'],
        ['Contabilidad I', 'CON-254AT'],
        ['Fundamentos de Derecho', 'FUD-222AT'],
        ['Informática', 'INF-232AT'],
        ['Cultura y Carrera Fiscal', 'CCF-232AT'],
        ['Problemas del Desarrollo', 'PRD-222AT'],
      ],
      [
        ['Matemática Financiera', 'MAF-343AT'],
        ['Contabilidad II', 'CON-354AT'],
        ['Legislación Fiscal', 'LEF-322AT'],
        ['Operaciones Aduaneras', 'OPA-333AT'],
        ['Impuesto Sobre la Renta I', 'ISR-343AT'],
        ['Administración Pública y Legislación Administrativa', 'ALA-333AT'],
        ['Código Orgánico Tributario I', 'COT-322AT'],
      ],
      [
        ['Política Monetaria Fiscal', 'PMF-433AT'],
        ['Contabilidad de Costo', 'COC-443AT'],
        ['Análisis e Interpr. de Estados Financ.', 'AEF-443AT'],
        ['Expedientes de Averiguaciones Administrativas', 'EAA-422AT'],
        ['Impuesto Sobre la Renta II', 'ISR-443AT'],
        ['Impuestos al Valor Agregado', 'IVA-433AT'],
        ['Código Orgánico Tributario II', 'COT-422AT'],
        ['Metodología de la Investigación', 'MEI-422AT'],
      ],
      [
        ['Ética del Funcionario Fiscal', 'EFF-522AT'],
        ['Presupuesto Público', 'PRP-543AT'],
        ['Auditoría Fiscal', 'AUF-543AT'],
        ['Electiva', 'ELE-522AT'],
        ['Tributos Municipales', 'TRM-543AT'],
        ['Proyecto de Investigación', 'PRI-522AT'],
        ['Impuesto a la Producción', 'IPR-522AT'],
      ],
      [
        ['Trabajo de Grado', 'TEG-608AT'],
        ['Pasantías', 'PAS-605AT'],
      ],
    ],
  },
  {
    nombre: 'Administración de Empresas',
    codigo: 'AE',
    periodos: [
      [
        ['Matemática I', 'MAT-164AE'],
        ['Lenguaje y Comunicación', 'LEC-132AE'],
        ['Inglés I', 'ING-143AE'],
        ['Fundamentos de la Economía', 'FUE-133AE'],
        ['Informática I', 'INF-132AE'],
        ['Habilidades Blandas', 'HABB-122AE'],
        ['Técnicas de Estudio e Investigación', 'TEI-122AE'],
      ],
      [
        ['Matemática II', 'MAT-264AE'],
        ['Contabilidad I', 'CON-253AE'],
        ['Inglés II', 'ING-243AE'],
        ['Economía de la Empresa', 'ECE-232AE'],
        ['Informática II', 'INF-232AE'],
        ['Fundamentos de Derecho', 'FUD-222AE'],
        ['Educación Ambiental', 'EDA-222AE'],
      ],
      [
        ['Matemática Financiera', 'MAF-343AE'],
        ['Estadística I', 'EST-343AE'],
        ['Contabilidad II', 'CON-353AE'],
        ['Problemas del Desarrollo', 'PRD-322AE'],
        ['Introducción a la Administración', 'INA-333AE'],
        ['Legislación Fiscal y Mercantil', 'LFM-343AE'],
        ['Instituciones Financieras', 'IFI-332AE'],
      ],
      [
        ['Investigación de Operaciones', 'INO-443AE'],
        ['Estadística II', 'EST-443AE'],
        ['Presupuesto Empresarial', 'PRE-443AE'],
        ['Administración Financiera', 'ADF-432AE'],
        ['Organización de Empresas', 'ORE-432AE'],
        ['Derecho y Legislación Laboral', 'DLL-422AE'],
        ['Metodología de la Investigación', 'MEI-422AE'],
        ['Sistemas y Procedimientos Administrativos', 'SPA-433AE'],
      ],
      [
        ['Sistemas de Información Administrativa', 'SIA-532AE'],
        ['Administración de Recursos Humanos', 'ARH-543AE'],
        ['Análisis e Interpr. de Estados Financ.', 'AEF-543AE'],
        ['Administración de Inventarios', 'ADI-543AE'],
        ['Administración de Compras', 'ADC-543AE'],
        ['Gerencia', 'GER-533AE'],
        ['Proyecto de Investigación', 'PRI-522AE'],
        ['Servicio Comunitario', 'SEC-500AE'],
      ],
      [
        ['Trabajo de Grado', 'TEG-608AE'],
        ['Pasantías', 'PAS-605AE'],
      ],
    ],
  },
  {
    nombre: 'Informática',
    codigo: 'IF',
    periodos: [
      [
        ['Matemática I', 'MAT-164IF'],
        ['Inglés I', 'ING-143IF'],
        ['Informática Básica', 'INB-132IF'],
        ['Lenguaje y Comunicación', 'LEC-132IF'],
        ['Lógica', 'LOG-132IF'],
        ['Habilidades Blandas', 'HABB-122IF'],
        ['Introducción a la Administración', 'INA-122IF'],
        ['Técnicas de Estudio e Investigación', 'TEI-122IF'],
      ],
      [
        ['Matemática II', 'MAT-243IF'],
        ['Inglés II', 'ING-232IF'],
        ['Estructura de Datos', 'ESD-232IF'],
        ['Técnicas de Programación', 'TEP-221IF'],
        ['Programación I', 'PRO-263IF'],
        ['Arquitectura del Computador', 'ARC-221IF'],
        ['Sistemas de Información', 'SII-232IF'],
        ['Recursos del Software', 'RES-221IF'],
      ],
      [
        ['Matemática III', 'MAT-343IF'],
        ['Estadística I', 'EST-353IF'],
        ['Base de Datos', 'BAD-332IF'],
        ['Sistemas Operativos I', 'SIO-332IF'],
        ['Programación II', 'PRO-363IF'],
        ['Redes I', 'RED-321IF'],
        ['Análisis de Sistemas I', 'ANS-321IF'],
      ],
      [
        ['Investigación de Operaciones', 'INO-432IF'],
        ['Estadística II', 'EST-443IF'],
        ['Análisis de Sistemas II', 'ANS-421IF'],
        ['Sistemas Operativos II', 'SIO-432IF'],
        ['Programación III', 'PRO-463IF'],
        ['Redes II', 'RED-432IF'],
        ['Metodología de la Investigación', 'MEI-422IF'],
        ['Administración del CPD', 'CPD-422IF'],
      ],
      [
        ['Administración y Control de Proyectos', 'ACP-532IF'],
        ['Electiva (Nuevas Tecnologías)', 'ELE-532IFNT'],
        ['Comunicaciones Móviles', 'COM-522IF'],
        ['Auditoría de Sistemas', 'AUS-522IF'],
        ['Programación IV', 'PRO-563IF'],
        ['Sistemas Distribuidos', 'SID-532IF'],
        ['Microprocesadores', 'MIC-532IF'],
        ['Proyecto de Investigación', 'PRI-522IF'],
        ['Servicio Comunitario', 'SEC-500IF'],
      ],
      [
        ['Trabajo de Grado', 'TEG-608IF'],
      ],
    ],
  },
];

// Mismo formato que los códigos que genera academicoController (sin 0/O ni 1/I)
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generarCodigo = () =>
  Array.from({ length: 6 }, () => ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)]).join('');

async function insertarMateria(nombre, codigo, carreraId, semestre) {
  // Si el código de inscripción generado ya existe (muy improbable), se intenta con otro
  for (let intento = 1; ; intento++) {
    try {
      await pool.query(
        'INSERT INTO materias (nombre, codigo, carrera_id, semestre, codigo_inscripcion) VALUES (?, ?, ?, ?, ?)',
        [nombre, codigo, carreraId, semestre, generarCodigo()]
      );
      return;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || intento === 5) throw error;
    }
  }
}

async function seed() {
  for (const carrera of CARRERAS) {
    const [existe] = await pool.query('SELECT id FROM carreras WHERE codigo = ?', [carrera.codigo]);
    let carreraId = existe[0]?.id;
    if (!carreraId) {
      const [r] = await pool.query('INSERT INTO carreras (nombre, codigo) VALUES (?, ?)', [carrera.nombre, carrera.codigo]);
      carreraId = r.insertId;
    }

    const [actuales] = await pool.query('SELECT codigo FROM materias WHERE carrera_id = ?', [carreraId]);
    const registradas = new Set(actuales.map((m) => m.codigo));

    let creadas = 0;
    let total = 0;
    for (const [i, materias] of carrera.periodos.entries()) {
      for (const [nombre, codigo] of materias) {
        total++;
        if (registradas.has(codigo)) continue;
        await insertarMateria(nombre, codigo, carreraId, i + 1);
        creadas++;
      }
    }
    console.log(`  ${carrera.nombre.padEnd(28)} ${carrera.periodos.length} periodos, ${total} materias (${creadas} nuevas)`);
  }
}

seed()
  .catch((error) => {
    console.error('Error al cargar las carreras:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
