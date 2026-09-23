import type { ReactionRule } from '@/types'

/**
 * Reaction rule table.
 *
 * Every rule is matched against the *set* of reagent ids inside one vessel
 * plus that vessel's conditions. Rules never look at positions, pressures or
 * fluid flow — this is the "macro state machine + region detection" model the
 * sandbox is built on.
 *
 * Ordering does not matter for correctness: the engine sorts by `priority`
 * descending and applies the first rule whose reactants and conditions match.
 * `rate` is expressed in "reaction units per second", where one unit consumes
 * one unit of each stoichiometric reactant.
 */
export const REACTION_RULES: ReactionRule[] = [
  /* ---------------------------------------------------------------------- */
  /*  Metal + acid — gas evolution                                           */
  /* ---------------------------------------------------------------------- */
  {
    id: 'zn-hcl',
    name: '锌与稀盐酸反应',
    equation: 'Zn + 2HCl → ZnCl₂ + H₂↑',
    reactants: ['zn', 'hcl'],
    products: ['zncl2', 'h2'],
    rate: 1.6,
    priority: 70,
    effects: {
      gas: { reagentId: 'h2', label: 'H₂', color: '#cfe9f7', amount: 1, intensity: 1 },
      temperatureDelta: 1.2,
    },
    description: '锌粒表面产生大量气泡，生成氢气并放热。',
  },
  {
    id: 'mg-hcl',
    name: '镁与稀盐酸反应',
    equation: 'Mg + 2HCl → MgCl₂ + H₂↑',
    reactants: ['mg', 'hcl'],
    products: ['mgcl2', 'h2'],
    rate: 2.8,
    priority: 72,
    effects: {
      gas: { reagentId: 'h2', label: 'H₂', color: '#cfe9f7', amount: 1, intensity: 1.9 },
      temperatureDelta: 3.4,
    },
    description: '镁条剧烈溶解，气泡急速逸出，试管明显发烫。',
  },
  {
    id: 'fe-hcl',
    name: '铁与稀盐酸反应',
    equation: 'Fe + 2HCl → FeCl₂ + H₂↑',
    reactants: ['fe', 'hcl'],
    products: ['fecl2', 'h2'],
    rate: 1.1,
    priority: 68,
    effects: {
      gas: { reagentId: 'h2', label: 'H₂', color: '#cfe9f7', amount: 1, intensity: 0.9 },
      temperatureDelta: 0.9,
    },
    description: '铁粉逐渐溶解，溶液变为浅绿色，同时有气泡产生。',
  },
  {
    id: 'zn-h2so4',
    name: '锌与稀硫酸反应',
    equation: 'Zn + H₂SO₄ → ZnSO₄ + H₂↑',
    reactants: ['zn', 'h2so4'],
    products: ['na2so4', 'h2'],
    rate: 1.5,
    priority: 70,
    effects: {
      gas: { reagentId: 'h2', label: 'H₂', color: '#cfe9f7', amount: 1, intensity: 1 },
      temperatureDelta: 1.1,
    },
    description: '锌粒与稀硫酸反应放出氢气。',
  },
  {
    id: 'fe-h2so4',
    name: '铁与稀硫酸反应',
    equation: 'Fe + H₂SO₄ → FeSO₄ + H₂↑',
    reactants: ['fe', 'h2so4'],
    products: ['feso4', 'h2'],
    rate: 1,
    priority: 68,
    effects: {
      gas: { reagentId: 'h2', label: 'H₂', color: '#cfe9f7', amount: 1, intensity: 0.8 },
      temperatureDelta: 0.8,
    },
    description: '铁粉溶解，溶液呈浅绿色并放出氢气。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Carbonate + acid — carbon dioxide                                      */
  /* ---------------------------------------------------------------------- */
  {
    id: 'caco3-hcl',
    name: '碳酸钙与稀盐酸反应',
    equation: 'CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑',
    reactants: ['caco3', 'hcl'],
    products: ['cacl2', 'water', 'co2'],
    rate: 2.2,
    priority: 74,
    effects: {
      gas: { reagentId: 'co2', label: 'CO₂', color: '#bcc6d2', amount: 1, intensity: 2.1 },
      temperatureDelta: 0.7,
    },
    description: '固体迅速溶解并剧烈起泡，生成二氧化碳。',
  },
  {
    id: 'na2co3-hcl',
    name: '碳酸钠与稀盐酸反应',
    equation: 'Na₂CO₃ + 2HCl → 2NaCl + H₂O + CO₂↑',
    reactants: ['na2co3', 'hcl'],
    products: ['nacl', 'water', 'co2'],
    rate: 2.6,
    priority: 74,
    effects: {
      gas: { reagentId: 'co2', label: 'CO₂', color: '#bcc6d2', amount: 1, intensity: 2.4 },
      temperatureDelta: 0.6,
    },
    description: '产生大量气泡，是实验室快速制备二氧化碳的方法。',
  },
  {
    id: 'nahco3-hcl',
    name: '碳酸氢钠与稀盐酸反应',
    equation: 'NaHCO₃ + HCl → NaCl + H₂O + CO₂↑',
    reactants: ['nahco3', 'hcl'],
    products: ['nacl', 'water', 'co2'],
    rate: 3,
    priority: 74,
    effects: {
      gas: { reagentId: 'co2', label: 'CO₂', color: '#bcc6d2', amount: 1, intensity: 2.6 },
      temperatureDelta: 0.4,
    },
    description: '小苏打遇酸立即剧烈起泡。',
  },
  {
    id: 'caco3-h2so4',
    name: '碳酸钙与稀硫酸反应',
    equation: 'CaCO₃ + H₂SO₄ → CaSO₄ + H₂O + CO₂↑',
    reactants: ['caco3', 'h2so4'],
    products: ['water', 'co2'],
    rate: 1.2,
    priority: 72,
    effects: {
      gas: { reagentId: 'co2', label: 'CO₂', color: '#bcc6d2', amount: 1, intensity: 1.2 },
      temperatureDelta: 0.5,
    },
    description: '反应较快停止，因为生成的硫酸钙微溶并覆盖在固体表面。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Metal oxide + acid                                                     */
  /* ---------------------------------------------------------------------- */
  {
    id: 'cuo-hcl',
    name: '氧化铜与稀盐酸反应',
    equation: 'CuO + 2HCl → CuCl₂ + H₂O',
    reactants: ['cuo', 'hcl'],
    products: ['cucl2', 'water'],
    rate: 1.8,
    priority: 70,
    effects: {
      temperatureDelta: 1,
    },
    description: '黑色粉末逐渐溶解，溶液变为蓝绿色。',
  },
  {
    id: 'cuo-h2so4',
    name: '氧化铜与稀硫酸反应',
    equation: 'CuO + H₂SO₄ → CuSO₄ + H₂O',
    reactants: ['cuo', 'h2so4'],
    products: ['cuso4', 'water'],
    rate: 1.8,
    priority: 70,
    effects: {
      temperatureDelta: 1,
    },
    description: '黑色氧化铜溶解，溶液变为蓝色。',
  },
  {
    id: 'fe2o3-hcl',
    name: '氧化铁与稀盐酸反应',
    equation: 'Fe₂O₃ + 6HCl → 2FeCl₃ + 3H₂O',
    reactants: ['fe2o3', 'hcl'],
    products: ['fecl3', 'water'],
    rate: 1.5,
    priority: 70,
    effects: {
      temperatureDelta: 0.9,
    },
    description: '红棕色铁锈溶解，溶液变为棕黄色。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Neutralisation — strongly exothermic                                   */
  /* ---------------------------------------------------------------------- */
  {
    id: 'hcl-naoh',
    name: '盐酸与氢氧化钠中和',
    equation: 'HCl + NaOH → NaCl + H₂O',
    reactants: ['hcl', 'naoh'],
    products: ['nacl', 'water'],
    rate: 3.4,
    priority: 90,
    effects: {
      temperatureDelta: 4.2,
    },
    description: '酸碱中和，放出大量热，溶液温度迅速升高。',
  },
  {
    id: 'h2so4-naoh',
    name: '硫酸与氢氧化钠中和',
    equation: 'H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O',
    reactants: ['h2so4', 'naoh'],
    products: ['na2so4', 'water'],
    rate: 3.4,
    priority: 90,
    effects: {
      temperatureDelta: 4.6,
    },
    description: '强酸强碱中和，放热明显。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Precipitation                                                          */
  /* ---------------------------------------------------------------------- */
  {
    id: 'agno3-nacl',
    name: '硝酸银与氯离子反应',
    equation: 'AgNO₃ + Cl⁻ → AgCl↓',
    reactants: ['agno3', 'hcl'],
    products: ['agcl'],
    rate: 3,
    priority: 88,
    effects: {
      precipitate: { reagentId: 'agcl', amount: 1 },
      temperatureDelta: 0.2,
    },
    description: '立即生成白色氯化银沉淀，是检验氯离子的经典方法。',
  },
  {
    id: 'cacl2-agno3',
    name: '硝酸银与氯化钙反应',
    equation: '2AgNO₃ + CaCl₂ → 2AgCl↓ + Ca(NO₃)₂',
    reactants: ['agno3', 'cacl2'],
    products: ['agcl'],
    rate: 3,
    priority: 86,
    effects: {
      precipitate: { reagentId: 'agcl', amount: 1 },
    },
    description: '生成白色氯化银沉淀。',
  },
  {
    id: 'agno3-ki',
    name: '硝酸银与碘化钾反应',
    equation: 'AgNO₃ + KI → AgI↓ + KNO₃',
    reactants: ['agno3', 'ki'],
    products: ['agi', 'kno3'],
    rate: 3,
    priority: 88,
    effects: {
      precipitate: { reagentId: 'agi', amount: 1 },
    },
    description: '生成黄色碘化银沉淀。',
  },
  {
    id: 'cuso4-naoh',
    name: '硫酸铜与氢氧化钠反应',
    equation: 'CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄',
    reactants: ['cuso4', 'naoh'],
    products: ['cuoh2', 'na2so4'],
    rate: 2.8,
    priority: 86,
    effects: {
      precipitate: { reagentId: 'cuoh2', amount: 1 },
      temperatureDelta: 0.6,
    },
    description: '产生蓝色絮状沉淀。',
  },
  {
    id: 'fecl3-naoh',
    name: '氯化铁与氢氧化钠反应',
    equation: 'FeCl₃ + 3NaOH → Fe(OH)₃↓ + 3NaCl',
    reactants: ['fecl3', 'naoh'],
    products: ['feoh3', 'nacl'],
    rate: 2.8,
    priority: 86,
    effects: {
      precipitate: { reagentId: 'feoh3', amount: 1 },
    },
    description: '产生红褐色絮状沉淀。',
  },
  {
    id: 'feso4-naoh',
    name: '硫酸亚铁与氢氧化钠反应',
    equation: 'FeSO₄ + 2NaOH → Fe(OH)₂↓ + Na₂SO₄',
    reactants: ['feso4', 'naoh'],
    products: ['feoh2', 'na2so4'],
    rate: 2.8,
    priority: 86,
    effects: {
      precipitate: { reagentId: 'feoh2', amount: 1 },
    },
    description: '先生成白色沉淀，随即被空气氧化为灰绿色。',
  },
  {
    id: 'mgcl2-naoh',
    name: '氯化镁与氢氧化钠反应',
    equation: 'MgCl₂ + 2NaOH → Mg(OH)₂↓ + 2NaCl',
    reactants: ['mgcl2', 'naoh'],
    products: ['mgoh2', 'nacl'],
    rate: 2.8,
    priority: 86,
    effects: {
      precipitate: { reagentId: 'mgoh2', amount: 1 },
    },
    description: '生成白色氢氧化镁沉淀。',
  },
  {
    id: 'cuso4-caoh2',
    name: '硫酸铜与石灰水反应',
    equation: 'CuSO₄ + Ca(OH)₂ → Cu(OH)₂↓ + CaSO₄',
    reactants: ['cuso4', 'caoh2-solution'],
    products: ['cuoh2'],
    rate: 2.6,
    priority: 84,
    effects: {
      precipitate: { reagentId: 'cuoh2', amount: 1 },
    },
    description: '生成蓝色沉淀，是检验氢氧化钙的常用方法。',
  },
  {
    id: 'co2-caoh2',
    name: '二氧化碳使石灰水变浑浊',
    equation: 'CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O',
    reactants: ['co2', 'caoh2-solution'],
    products: ['caco3', 'water'],
    rate: 2.4,
    priority: 82,
    effects: {
      precipitate: { reagentId: 'caco3', amount: 1 },
    },
    description: '澄清石灰水变浑浊，这是检验二氧化碳的特征现象。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Displacement — metal + salt solution                                   */
  /* ---------------------------------------------------------------------- */
  {
    id: 'fe-cuso4',
    name: '铁与硫酸铜溶液反应',
    equation: 'Fe + CuSO₄ → FeSO₄ + Cu',
    reactants: ['fe', 'cuso4'],
    products: ['feso4', 'cu-deposited'],
    rate: 1.4,
    priority: 76,
    effects: {
      precipitate: { reagentId: 'cu-deposited', amount: 1 },
      temperatureDelta: 0.5,
    },
    description: '铁粉表面析出紫红色铜，溶液由蓝色变为浅绿色。',
  },
  {
    id: 'mg-cuso4',
    name: '镁与硫酸铜溶液反应',
    equation: 'Mg + CuSO₄ → MgSO₄ + Cu',
    reactants: ['mg', 'cuso4'],
    products: ['cu-deposited'],
    rate: 2,
    priority: 76,
    effects: {
      precipitate: { reagentId: 'cu-deposited', amount: 1 },
      temperatureDelta: 1.8,
    },
    description: '镁条表面迅速覆盖紫红色铜层，溶液褪色。',
  },
  {
    id: 'zn-cuso4',
    name: '锌与硫酸铜溶液反应',
    equation: 'Zn + CuSO₄ → ZnSO₄ + Cu',
    reactants: ['zn', 'cuso4'],
    products: ['cu-deposited'],
    rate: 1.6,
    priority: 76,
    effects: {
      precipitate: { reagentId: 'cu-deposited', amount: 1 },
      temperatureDelta: 0.8,
    },
    description: '锌粒表面析出紫红色铜，蓝色溶液逐渐变浅。',
  },
  {
    id: 'fe-agno3',
    name: '铁与硝酸银溶液反应',
    equation: 'Fe + 2AgNO₃ → Fe(NO₃)₂ + 2Ag',
    reactants: ['fe', 'agno3'],
    products: [],
    rate: 1.4,
    priority: 76,
    effects: {
      temperatureDelta: 0.9,
    },
    description: '铁粉表面析出银白色金属银，溶液逐渐变为浅绿色。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Indicators — not consumed                                              */
  /* ---------------------------------------------------------------------- */
  {
    id: 'phenolphthalein-base',
    name: '酚酞遇碱变红',
    equation: '酚酞(无色) --OH⁻--> 酚酞(红色)',
    reactants: ['phenolphthalein', 'naoh'],
    products: [],
    consume: false,
    rate: 4,
    priority: 96,
    effects: {
      colorChange: '#e8386f',
      opacityChange: 0.72,
    },
    description: '无色酚酞在碱性溶液中变为红色。',
  },
  {
    id: 'litmus-acid',
    name: '石蕊遇酸变红',
    equation: '石蕊(紫色) --H⁺--> 石蕊(红色)',
    reactants: ['litmus', 'hcl'],
    products: [],
    consume: false,
    rate: 4,
    priority: 96,
    effects: {
      colorChange: '#d93b3b',
      opacityChange: 0.85,
    },
    description: '紫色石蕊试液遇酸变为红色。',
  },
  {
    id: 'litmus-base',
    name: '石蕊遇碱变蓝',
    equation: '石蕊(紫色) --OH⁻--> 石蕊(蓝色)',
    reactants: ['litmus', 'naoh'],
    products: [],
    consume: false,
    rate: 4,
    priority: 96,
    effects: {
      colorChange: '#3b62d9',
      opacityChange: 0.85,
    },
    description: '紫色石蕊试液遇碱变为蓝色。',
  },
  {
    id: 'starch-iodine',
    name: '淀粉遇碘变蓝',
    equation: '淀粉 + I₂ → 蓝色络合物',
    reactants: ['starch', 'i2-solution'],
    products: ['ki3'],
    consume: false,
    rate: 4,
    priority: 96,
    effects: {
      colorChange: '#1b2f8f',
      opacityChange: 0.95,
    },
    description: '淀粉溶液遇碘立即显深蓝色，是碘的特征检验。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Redox — needs an oxidiser plus a reducing agent                        */
  /* ---------------------------------------------------------------------- */
  {
    id: 'kmno4-h2o2',
    name: '高锰酸钾氧化过氧化氢',
    equation: '2KMnO₄ + 3H₂O₂ → 2MnO₂ + 2KOH + 3O₂↑',
    reactants: ['kmno4', 'h2o2'],
    products: ['mno2', 'o2'],
    rate: 2.4,
    priority: 80,
    effects: {
      gas: { reagentId: 'o2', label: 'O₂', color: '#a8e6f0', amount: 1, intensity: 1.6 },
      colorChange: '#8d6a3a',
      temperatureDelta: 1.4,
    },
    description: '紫色迅速褪去，同时析出棕色沉淀并放出氧气。',
  },
  {
    id: 'ki-h2o2',
    name: '过氧化氢氧化碘化钾',
    equation: '2KI + H₂O₂ → I₂ + 2KOH',
    reactants: ['ki', 'h2o2'],
    products: [],
    rate: 2,
    priority: 78,
    effects: {
      colorChange: '#8b6a1f',
      opacityChange: 0.7,
    },
    description: '无色溶液逐渐变为棕黄色，说明有碘单质生成。',
  },
  {
    id: 'ki-kmno4',
    name: '高锰酸钾氧化碘化钾',
    equation: '2KMnO₄ + 10KI + 8H₂SO₄ → 2MnSO₄ + 5I₂ + 6K₂SO₄ + 8H₂O',
    reactants: ['ki', 'kmno4'],
    products: [],
    rate: 2.2,
    priority: 78,
    effects: {
      colorChange: '#7a5a12',
      opacityChange: 0.85,
    },
    description: '紫色褪去并析出棕黄色碘单质。',
  },
  {
    id: 'mg-o2',
    name: '镁在氧气中燃烧',
    equation: '2Mg + O₂ → 2MgO',
    reactants: ['mg', 'o2'],
    products: [],
    conditions: { heat: true },
    rate: 1.6,
    priority: 92,
    effects: {
      glow: '#ffffff',
      temperatureDelta: 9,
      colorChange: '#f4f6f8',
      opacityChange: 0.9,
    },
    description: '镁剧烈燃烧，发出耀眼白光并放出大量热。',
  },
  {
    id: 'h2-o2',
    name: '氢气与氧气爆鸣',
    equation: '2H₂ + O₂ --点燃--> 2H₂O',
    reactants: ['h2', 'o2'],
    products: ['water'],
    conditions: { heat: true },
    rate: 6,
    priority: 100,
    effects: {
      explosion: { power: 1, message: '氢气与氧气的混合气被点燃，发出尖锐爆鸣声！' },
      temperatureDelta: 12,
    },
    description: '氢氧混合气遇火瞬间化合，产生爆鸣。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Combustion — flame required                                            */
  /* ---------------------------------------------------------------------- */
  {
    id: 'alcohol-combustion',
    name: '乙醇燃烧',
    equation: 'C₂H₅OH + 3O₂ --点燃--> 2CO₂ + 3H₂O',
    reactants: ['alcohol', 'o2'],
    products: ['co2', 'water'],
    conditions: { heat: true },
    rate: 2.6,
    priority: 94,
    effects: {
      glow: '#7fc4ff',
      temperatureDelta: 7,
      gas: { reagentId: 'co2', label: 'CO₂', color: '#bcc6d2', amount: 0.6, intensity: 0.6 },
    },
    description: '乙醇在氧气中燃烧，发出淡蓝色火焰。',
  },
  {
    id: 'zinc-burn',
    name: '锌在空气中灼烧',
    equation: '2Zn + O₂ --Δ--> 2ZnO',
    reactants: ['zn', 'o2'],
    products: [],
    conditions: { heat: true },
    rate: 1.2,
    priority: 90,
    effects: {
      glow: '#9fe870',
      temperatureDelta: 5,
      colorChange: '#dfe4c9',
      opacityChange: 0.85,
    },
    description: '锌受强热燃烧，发出蓝绿色火焰并生成白色氧化锌。',
  },

  /* ---------------------------------------------------------------------- */
  /*  Thermal decomposition — heat only                                      */
  /* ---------------------------------------------------------------------- */
  {
    id: 'caco3-decompose',
    name: '碳酸钙高温分解',
    equation: 'CaCO₃ --高温--> CaO + CO₂↑',
    reactants: ['caco3'],
    products: ['co2'],
    conditions: { minTemperature: 180 },
    rate: 0.8,
    priority: 60,
    effects: {
      gas: { reagentId: 'co2', label: 'CO₂', color: '#bcc6d2', amount: 1, intensity: 0.6 },
      temperatureDelta: -1.5,
    },
    description: '石灰石在高温下分解，需要持续强热。',
  },
  {
    id: 'nahco3-decompose',
    name: '碳酸氢钠受热分解',
    equation: '2NaHCO₃ --Δ--> Na₂CO₃ + H₂O + CO₂↑',
    reactants: ['nahco3'],
    products: ['na2co3', 'water', 'co2'],
    conditions: { minTemperature: 110 },
    rate: 1.1,
    priority: 60,
    effects: {
      gas: { reagentId: 'co2', label: 'CO₂', color: '#bcc6d2', amount: 1, intensity: 0.9 },
      temperatureDelta: -0.6,
    },
    description: '小苏打受热分解放出二氧化碳，是焙制糕点的原理。',
  },
  {
    id: 'cuoh2-decompose',
    name: '氢氧化铜受热分解',
    equation: 'Cu(OH)₂ --Δ--> CuO + H₂O',
    reactants: ['cuoh2'],
    products: ['cuo', 'water'],
    conditions: { minTemperature: 90 },
    rate: 1,
    priority: 62,
    effects: {
      colorChange: '#1c1c22',
      temperatureDelta: -0.5,
    },
    description: '蓝色沉淀受热变为黑色的氧化铜。',
  },
  {
    id: 'h2o2-decompose',
    name: '过氧化氢受热分解',
    equation: '2H₂O₂ --Δ--> 2H₂O + O₂↑',
    reactants: ['h2o2'],
    products: ['water', 'o2'],
    conditions: { minTemperature: 60 },
    rate: 1.4,
    priority: 58,
    effects: {
      gas: { reagentId: 'o2', label: 'O₂', color: '#a8e6f0', amount: 1, intensity: 1.2 },
      temperatureDelta: -0.4,
    },
    description: '过氧化氢受热加速分解，放出氧气。',
  },
  {
    id: 'mno2-h2o2',
    name: '二氧化锰催化过氧化氢分解',
    equation: '2H₂O₂ --MnO₂--> 2H₂O + O₂↑',
    reactants: ['h2o2', 'mno2'],
    products: ['water', 'o2'],
    /**
     * A catalyst rule: `mno2` is declared as the catalyst so the engine keeps
     * it out of the consumption step even though `consume` defaults to true.
     */
    conditions: { catalyst: 'mno2' },
    rate: 3.2,
    priority: 84,
    effects: {
      gas: { reagentId: 'o2', label: 'O₂', color: '#a8e6f0', amount: 1, intensity: 2.4 },
      temperatureDelta: 0.5,
    },
    description: '加入二氧化锰后立即产生大量气泡，黑色粉末反应前后不变。',
  },
  {
    id: 'kmno4-decompose',
    name: '高锰酸钾受热分解',
    equation: '2KMnO₄ --Δ--> K₂MnO₄ + MnO₂ + O₂↑',
    reactants: ['kmno4'],
    products: ['mno2', 'o2'],
    conditions: { minTemperature: 160 },
    rate: 1,
    priority: 60,
    effects: {
      gas: { reagentId: 'o2', label: 'O₂', color: '#a8e6f0', amount: 1, intensity: 0.8 },
      colorChange: '#2f6b3a',
      temperatureDelta: -0.8,
    },
    description: '紫色晶体受热分解，放出氧气并留下黑色残渣。',
  },
]

/**
 * Index of rule ids that the UI can suggest for a given pair of reagents.
 * Built once at module load; keys are sorted `a|b` pairs.
 */
export const RULES_BY_PAIR: Map<string, ReactionRule[]> = (() => {
  const index = new Map<string, ReactionRule[]>()
  for (const rule of REACTION_RULES) {
    if (rule.reactants.length !== 2) continue
    const key = [...rule.reactants].sort().join('|')
    const bucket = index.get(key)
    if (bucket) bucket.push(rule)
    else index.set(key, [rule])
  }
  return index
})()
