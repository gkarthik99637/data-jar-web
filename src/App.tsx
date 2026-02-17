import React, { useState, useEffect, useMemo } from 'react';
import { 
    ChevronRight, 
    Plus, 
    Trash2, 
    Download, 
    Upload, 
    X, 
    Check, 
    Hash,
    Type,
    ToggleLeft,
    List as ListIcon,
    Folder,
    Calculator,
    AlertCircle,
    Link,
    Copy,
    Zap,
    Play
} from 'lucide-react';

// --- Types ---

type DataType = 'text' | 'number' | 'boolean' | 'dictionary' | 'list' | 'expression';

interface DataNode {
  id: string;
  type: DataType;
  value: any; // string | number | boolean | DataNode[] | { [key: string]: DataNode }
  name: string; // Key name (used if parent is dictionary)
}

// --- Utils ---

const generateId = () => Math.random().toString(36).substr(2, 9);

// Resolve a path like "config.theme.color" or "users.0.name" in the data tree
const resolvePath = (root: DataNode[], path: string): any => {
  const parts = path.split('.');
  let current: any = root; // Root is essentially a list of nodes in our internal representation

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // If current is array (our internal representation of Dict or List children)
    if (Array.isArray(current)) {
      // Try to find by name (Dict key) or index (List index)
      const found = current.find(node => node.name === part) || current[parseInt(part)];
      if (!found) return undefined;
      
      if (i === parts.length - 1) {
        return found; // Return the node itself at the end
      }
      current = found.value;
    } else {
      return undefined; // Path goes deeper than structure allows
    }
  }
  return undefined;
};

// Evaluate expression string: "{{items.0.price}} * {{tax}}"
const evaluateExpression = (expression: string, root: DataNode[]): { result: any, error?: string } => {
  if (!expression) return { result: '' };

  // 1. Regex to find {{ path }} patterns
  const referenceRegex = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
  
  let resolvedString = expression;
  let hasReferences = false;

  try {
    resolvedString = expression.replace(referenceRegex, (_match, path) => {
      hasReferences = true;
      const node = resolvePath(root, path);
      
      if (!node) throw new Error(`Key not found: ${path}`);
      
      // If referencing another expression, we theoretically need recursion, 
      // but to prevent infinite loops, we'll just take the raw value or simple resolve.
      // For this MVP, we assume references point to primitives or simple values.
      if (node.type === 'expression') {
         // Simple 1-level recursion check could go here, but avoiding for stability
         return node.value; 
      }
      
      return String(node.value);
    });

    // 2. If it looks like math, try to eval it safely-ish
    // Only eval if it contains math operators or was a reference replacement
    const isMath = /[+\-*/%()]/.test(resolvedString) || !isNaN(Number(resolvedString));
    
    if (isMath && hasReferences) {
        // Very basic safety check - only allow digits and math symbols
        if (!/^[0-9+\-*/().\s]+$/.test(resolvedString)) {
            // If it resolved to text (e.g. "Hello " + "World"), handle string concat
             // Actually, JS eval handles strings too, but let's be careful.
             // If the resolved string is not purely math, return it as text
             return { result: resolvedString };
        }
        // eslint-disable-next-line no-new-func
        const mathResult = new Function(`return ${resolvedString}`)();
        return { result: mathResult };
    }

    return { result: resolvedString };

  } catch (err: any) {
    return { result: 'ERR', error: err.message };
  }
};


// Recursive function to get a flat object representation for Export
const exportData = (nodes: DataNode[]): any => {
  const result: any = {};
  nodes.forEach(node => {
    if (node.type === 'dictionary' && Array.isArray(node.value)) {
      result[node.name] = exportData(node.value);
    } else if (node.type === 'list' && Array.isArray(node.value)) {
      result[node.name] = node.value.map((item: DataNode) => {
        if (['dictionary', 'list'].includes(item.type)) {
            // For lists, we need to handle the structure differently since our internal node has a 'name' but lists are anonymous
            // We'll treat the internal 'value' array as the source
            return Array.isArray(item.value) ? exportData(item.value) : item.value; 
        }
        return item.value;
      });
    } else {
      result[node.name] = node.value;
    }
  });
  return result;
};


// --- Components ---

const IconForType = ({ type, className = "w-4 h-4" }: { type: DataType, className?: string }) => {
  switch (type) {
    case 'text': return <Type className={className} />;
    case 'number': return <Hash className={className} />;
    case 'boolean': return <ToggleLeft className={className} />;
    case 'list': return <ListIcon className={className} />;
    case 'dictionary': return <Folder className={className} />;
    case 'expression': return <Calculator className={`text-purple-500 ${className}`} />;
    default: return <Type className={className} />;
  }
};

const Breadcrumbs = ({ path, onNavigate }: { path: { id: string, name: string }[], onNavigate: (index: number) => void }) => (
  <div className="flex items-center text-sm font-medium text-slate-500 overflow-x-auto whitespace-nowrap scrollbar-hide px-4 py-3 bg-slate-50 border-b border-slate-200">
    <button 
      onClick={() => onNavigate(-1)} 
      className="hover:text-blue-600 transition-colors flex items-center"
    >
      <Folder className="w-4 h-4 mr-1" />
      Jar
    </button>
    {path.map((item, index) => (
      <React.Fragment key={item.id}>
        <ChevronRight className="w-4 h-4 mx-1 text-slate-300 flex-shrink-0" />
        <button 
          onClick={() => onNavigate(index)}
          className={`hover:text-blue-600 transition-colors ${index === path.length - 1 ? 'text-slate-900' : ''}`}
        >
          {item.name}
        </button>
      </React.Fragment>
    ))}
  </div>
);

export default function App() {
  // --- State ---
  
  // 1. Load initial state from LocalStorage if available
  const [data, setData] = useState<DataNode[]>(() => {
    const saved = localStorage.getItem('data-jar-storage');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error("Failed to load local storage", e);
        }
    }
    // Default / First-time user state
    return [
        { id: '1', name: 'greeting', type: 'text', value: 'Hello World' },
        { id: '2', name: 'config', type: 'dictionary', value: [
            { id: '2a', name: 'theme', type: 'text', value: 'dark' },
            { id: '2b', name: 'fontSize', type: 'number', value: 14 }
        ]},
        { id: '3', name: 'price', type: 'number', value: 100 },
        { id: '4', name: 'tax_rate', type: 'number', value: 0.2 },
        { id: '5', name: 'total_cost', type: 'expression', value: '{{price}} * (1 + {{tax_rate}})' },
    ];
  });

  // 2. Persist to LocalStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('data-jar-storage', JSON.stringify(data));
  }, [data]);

  const [path, setPath] = useState<{ id: string, name: string, type: DataType }[]>([]);
  
  // UI State
  const [isAdding, setIsAdding] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [integrationModalOpen, setIntegrationModalOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);

  // Form State
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<DataType>('text');
  const [newItemValue, setNewItemValue] = useState<any>('');

  // Shortcuts Builder State
  const [shortcutKey, setShortcutKey] = useState('');
  const [shortcutValue, setShortcutValue] = useState('');
  const [shortcutType, setShortcutType] = useState<DataType>('text');

  // --- Helpers ---

  const currentLevelNodes = useMemo(() => {
    if (path.length === 0) return data;
    
    let current = data;
    for (const step of path) {
      const found = current.find(n => n.id === step.id);
      if (found && (found.type === 'dictionary' || found.type === 'list')) {
        current = found.value as DataNode[];
      } else {
        return []; 
      }
    }
    return current;
  }, [data, path]);

  // Deep update function for URL API
  const setDeepValue = (nodes: DataNode[], pathStr: string, value: any, type: DataType = 'text'): DataNode[] => {
    const parts = pathStr.split('.');
    const key = parts[0];
    const rest = parts.slice(1);
    
    // Normalize list indices if needed (though user might provide names)
    // For this simple implementation, we rely on 'name' matching.
    
    const existingIndex = nodes.findIndex(n => n.name === key);

    if (existingIndex >= 0) {
        // Node exists
        const node = nodes[existingIndex];
        
        if (rest.length === 0) {
            // Target reached, update value
            return [
                ...nodes.slice(0, existingIndex),
                { ...node, value: value, type: type }, // Update type too if provided
                ...nodes.slice(existingIndex + 1)
            ];
        } else {
            // Need to go deeper
            if (node.type !== 'dictionary' && node.type !== 'list') {
                return nodes; // Cannot traverse non-container
            }
            return [
                ...nodes.slice(0, existingIndex),
                { 
                    ...node, 
                    value: setDeepValue(node.value as DataNode[], rest.join('.'), value, type) 
                },
                ...nodes.slice(existingIndex + 1)
            ];
        }
    } else {
        // Create new
        if (rest.length === 0) {
            // Create leaf
            const newNode: DataNode = {
                id: generateId(),
                name: key,
                type: type,
                value: value
            };
            return [...nodes, newNode];
        } else {
            // Create intermediate
            const newNode: DataNode = {
                id: generateId(),
                name: key,
                type: 'dictionary',
                value: setDeepValue([], rest.join('.'), value, type)
            };
            return [...nodes, newNode];
        }
    }
  };

  // URL API Logic
  const handleApiTrigger = (key: string, value: string, type: string) => {
    if (key && (value !== null || type === 'dictionary' || type === 'list')) {
        // Clean value based on type
        let cleanValue: any = value;
        if (type === 'number') cleanValue = parseFloat(value);
        if (type === 'boolean') cleanValue = (value === 'true');
        if (type === 'dictionary' || type === 'list') cleanValue = [];
        
        // Execute update
        setData(prev => setDeepValue(prev, key, cleanValue, type as DataType));
        
        // Show success feedback
        setApiSuccess(`Updated key "${key}"`);
        setTimeout(() => setApiSuccess(null), 3000);
    }
  };

  // URL Listener (runs on mount and on popstate)
  useEffect(() => {
    const checkUrl = () => {
        const params = new URLSearchParams(window.location.search);
        const key = params.get('key');
        const value = params.get('value');
        const type = params.get('type') || 'text';
        
        if (key) {
            handleApiTrigger(key, value || '', type);
            // Clean URL without refresh
            window.history.replaceState({}, '', window.location.pathname);
        }
    };

    checkUrl();
    window.addEventListener('popstate', checkUrl);
    return () => window.removeEventListener('popstate', checkUrl);
  }, []);

  const updateDataTree = (updates: (nodes: DataNode[]) => DataNode[]) => {
    const recursiveUpdate = (nodes: DataNode[], depth: number): DataNode[] => {
      if (depth === path.length) {
        return updates(nodes);
      }
      
      const stepId = path[depth].id;
      return nodes.map(node => {
        if (node.id === stepId) {
          return {
            ...node,
            value: recursiveUpdate(node.value as DataNode[], depth + 1)
          };
        }
        return node;
      });
    };

    setData(prev => recursiveUpdate(prev, 0));
  };

  const handleAdd = () => {
    if (!newItemName.trim() && path[path.length-1]?.type !== 'list') return;
    const nameToUse = path[path.length-1]?.type === 'list' ? `${currentLevelNodes.length}` : newItemName;

    const newNode: DataNode = {
      id: generateId(),
      name: nameToUse,
      type: newItemType,
      value: ['dictionary', 'list'].includes(newItemType) ? [] : newItemValue
    };

    updateDataTree(nodes => [...nodes, newNode]);
    setIsAdding(false);
    resetForm();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this item?')) {
      updateDataTree(nodes => nodes.filter(n => n.id !== id));
    }
  };

  const handleUpdateValue = (id: string, newValue: any) => {
    updateDataTree(nodes => nodes.map(n => n.id === id ? { ...n, value: newValue } : n));
    setEditingNodeId(null);
  };

  const resetForm = () => {
    setNewItemName('');
    setNewItemType('text');
    setNewItemValue('');
  };

  const handleExport = () => {
    const exportObj = exportData(data);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "data_jar_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const parseImport = (obj: any): DataNode[] => {
     return Object.keys(obj).map(key => {
         const val = obj[key];
         const type = Array.isArray(val) ? 'list' : (typeof val === 'object' && val !== null) ? 'dictionary' : (typeof val);
         
         let finalType: DataType = 'text';
         if (type === 'number') finalType = 'number';
         if (type === 'boolean') finalType = 'boolean';
         if (type === 'list') finalType = 'list';
         if (type === 'dictionary') finalType = 'dictionary';
         
         let finalValue: any = val;
         if (finalType === 'dictionary') {
             finalValue = parseImport(val);
         } else if (finalType === 'list') {
             finalValue = val.map((item: any, idx: number) => {
                 return {
                     id: generateId(),
                     name: `${idx}`,
                     type: typeof item === 'object' ? 'dictionary' : typeof item, 
                     value: item 
                 }
             });
         }

         return {
             id: generateId(),
             name: key,
             type: finalType,
             value: finalValue
         };
     });
  };

  // Generate URL for shortcuts
  const generateApiUrl = () => {
      const baseUrl = window.location.origin + window.location.pathname;
      const params = new URLSearchParams();
      params.append('key', shortcutKey);
      params.append('value', shortcutValue);
      params.append('type', shortcutType);
      params.append('action', 'set');
      return `${baseUrl}?${params.toString()}`;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 font-sans text-slate-900 relative">
      
      {/* Success Toast */}
      {apiSuccess && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-2 rounded-full shadow-lg z-[60] flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">{apiSuccess}</span>
          </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 z-10">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
                    <Folder className="text-white w-5 h-5" />
                </div>
                <h1 className="text-lg font-bold tracking-tight">Data Jar</h1>
                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium ml-1">Local</span>
            </div>
            
            <div className="flex gap-2">
                <button onClick={() => setIntegrationModalOpen(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors" title="Shortcuts API">
                    <Link className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-slate-200 mx-1 self-center"></div>
                <button onClick={handleExport} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors" title="Export JSON">
                    <Download className="w-5 h-5" />
                </button>
                <button onClick={() => setImportModalOpen(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors" title="Import JSON">
                    <Upload className="w-5 h-5" />
                </button>
            </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="max-w-2xl mx-auto w-full bg-white border-b border-slate-200">
         <Breadcrumbs 
            path={path} 
            onNavigate={(index) => {
                if (index === -1) setPath([]);
                else setPath(path.slice(0, index + 1));
            }} 
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
            
            {/* Empty State */}
            {currentLevelNodes.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                    <Folder className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium">This jar is empty</p>
                    <p className="text-sm">Add a value to get started</p>
                </div>
            )}

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {currentLevelNodes.map((node) => {
                    const isContainer = node.type === 'dictionary' || node.type === 'list';
                    const isExpression = node.type === 'expression';
                    
                    // Resolve expression for display
                    let displayValue = node.value;
                    let exprError = null;
                    if (isExpression) {
                        const { result, error } = evaluateExpression(node.value, data);
                        displayValue = result;
                        exprError = error;
                    }

                    return (
                        <div 
                            key={node.id} 
                            className="group flex items-center justify-between p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => {
                                if (isContainer) {
                                    setPath([...path, { id: node.id, name: node.name, type: node.type }]);
                                } else {
                                    setEditingNodeId(node.id);
                                    setNewItemValue(node.value);
                                }
                            }}
                        >
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <IconForType type={node.type} className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="font-semibold text-slate-700 truncate">{node.name}</span>
                                    {path[path.length-1]?.type === 'list' && (
                                        <span className="text-xs text-slate-400 font-mono">index {node.name}</span>
                                    )}
                                </div>
                                <div className="text-sm text-slate-500 truncate font-mono">
                                    {isContainer ? (
                                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-500">
                                            {(node.value as DataNode[]).length} items
                                        </span>
                                    ) : isExpression ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-purple-600 font-bold">= {String(displayValue)}</span>
                                            {exprError && <AlertCircle className="w-3 h-3 text-red-500" />}
                                            <span className="text-slate-300 text-xs truncate max-w-[10rem]">{node.value}</span>
                                        </div>
                                    ) : (
                                        <span className="truncate">{String(node.value)}</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={(e) => handleDelete(node.id, e)}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                {isContainer ? (
                                    <ChevronRight className="w-5 h-5 text-slate-300" />
                                ) : (
                                    <div className="w-5 h-5" /> 
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Hint for Expressions */}
            {path.length === 0 && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 text-sm text-blue-800">
                    <Calculator className="w-5 h-5 flex-shrink-0 text-blue-500" />
                    <div>
                        <p className="font-semibold mb-1">Pro Tip: References</p>
                        <p className="opacity-80">
                            Use <strong>Expression</strong> type to reference other keys. 
                            Example: <code className="bg-blue-100 px-1 rounded">{`{{config.theme}}`}</code> or <code className="bg-blue-100 px-1 rounded">{`{{price}} * 1.2`}</code>.
                        </p>
                    </div>
                </div>
            )}
        </div>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6">
        <button 
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        >
            <Plus className="w-7 h-7" />
        </button>
      </div>

      {/* Add Item Modal */}
      {(isAdding || editingNodeId) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-200">
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="font-semibold text-slate-800">
                        {editingNodeId ? 'Edit Value' : 'Add to Jar'}
                    </h2>
                    <button onClick={() => { setIsAdding(false); setEditingNodeId(null); resetForm(); }} className="p-1 rounded-full hover:bg-slate-200 text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-4 space-y-4">
                    {/* Only show Name input if adding new and not in a list */}
                    {!editingNodeId && path[path.length-1]?.type !== 'list' && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Key Name</label>
                            <input 
                                autoFocus
                                type="text" 
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="e.g. settings, price, items"
                                value={newItemName}
                                onChange={e => setNewItemName(e.target.value)}
                            />
                        </div>
                    )}

                    {!editingNodeId && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['text', 'number', 'boolean', 'dictionary', 'list', 'expression'] as DataType[]).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => { setNewItemType(t); setNewItemValue(''); }}
                                        className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border text-xs font-medium transition-all ${
                                            newItemType === t 
                                            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' 
                                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <IconForType type={t} />
                                        <span className="capitalize">{t}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Value Editor */}
                    {!['dictionary', 'list'].includes(editingNodeId ? (currentLevelNodes.find(n => n.id === editingNodeId)?.type || 'text') : newItemType) && (
                        <div className="animate-in fade-in zoom-in-95 duration-200">
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                {(editingNodeId ? (currentLevelNodes.find(n => n.id === editingNodeId)?.type) : newItemType) === 'expression' ? 'Formula' : 'Value'}
                            </label>
                            
                            {(editingNodeId ? (currentLevelNodes.find(n => n.id === editingNodeId)?.type) : newItemType) === 'boolean' ? (
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button 
                                        className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${newItemValue === true ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setNewItemValue(true)}
                                    >
                                        True
                                    </button>
                                    <button 
                                        className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${newItemValue === false ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        onClick={() => setNewItemValue(false)}
                                    >
                                        False
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <textarea
                                        className={`w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm ${
                                            (editingNodeId ? (currentLevelNodes.find(n => n.id === editingNodeId)?.type) : newItemType) === 'expression' ? 'text-purple-700 bg-purple-50/50 border-purple-200 focus:border-purple-500 focus:ring-purple-500/20' : ''
                                        }`}
                                        rows={3}
                                        placeholder={(editingNodeId ? (currentLevelNodes.find(n => n.id === editingNodeId)?.type) : newItemType) === 'expression' ? '{{key}} + 10' : 'Value...'}
                                        value={newItemValue}
                                        onChange={e => setNewItemValue(e.target.value)}
                                    />
                                    {(editingNodeId ? (currentLevelNodes.find(n => n.id === editingNodeId)?.type) : newItemType) === 'expression' && (
                                        <div className="absolute top-2 right-2">
                                            <div className="bg-white/80 backdrop-blur rounded px-2 py-1 text-[10px] font-bold text-purple-600 shadow-sm border border-purple-100">
                                                EXP
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {(editingNodeId ? (currentLevelNodes.find(n => n.id === editingNodeId)?.type) : newItemType) === 'expression' && (
                                <p className="mt-2 text-xs text-slate-400">
                                    Reference other keys using <code className="bg-slate-100 px-1 rounded">{`{{keyName}}`}</code>. Supports basic math.
                                </p>
                            )}
                        </div>
                    )}

                    <button 
                        onClick={editingNodeId ? () => handleUpdateValue(editingNodeId, newItemValue) : handleAdd}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
                    >
                        {editingNodeId ? 'Save Changes' : 'Add Key'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Integration Modal (Shortcuts API) */}
      {integrationModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
                      <div className="flex items-center gap-3 mb-2">
                          <Zap className="w-6 h-6 text-yellow-400" />
                          <h3 className="text-xl font-bold">Shortcuts Integration</h3>
                      </div>
                      <p className="text-slate-300 text-sm">
                          Trigger this web app from Apple Shortcuts using the <strong>Open URL</strong> action.
                      </p>
                  </div>
                  
                  <div className="p-6 space-y-5">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">1. Configure Payload</label>
                          <div className="space-y-3">
                              <input 
                                  type="text"
                                  placeholder="Key Path (e.g. config.theme)"
                                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                  value={shortcutKey}
                                  onChange={e => setShortcutKey(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <select 
                                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                    value={shortcutType}
                                    onChange={e => setShortcutType(e.target.value as DataType)}
                                >
                                    <option value="text">Text</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Boolean</option>
                                </select>
                                <input 
                                    type="text"
                                    placeholder="Value"
                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                    value={shortcutValue}
                                    onChange={e => setShortcutValue(e.target.value)}
                                />
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">2. Generated URL</label>
                          <div className="flex items-center gap-2 bg-slate-100 p-3 rounded-lg border border-slate-200">
                              <code className="flex-1 text-xs text-slate-600 break-all font-mono whitespace-nowrap overflow-x-auto">
                                  {generateApiUrl()}
                              </code>
                              <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(generateApiUrl());
                                    setApiSuccess("Copied to clipboard!");
                                    setTimeout(() => setApiSuccess(null), 2000);
                                }}
                                className="p-2 hover:bg-white rounded-md text-slate-500 hover:text-blue-600 transition-colors"
                              >
                                  <Copy className="w-4 h-4" />
                              </button>
                          </div>
                          
                          {/* Test Button Added Here */}
                          <div className="mt-3 flex justify-end">
                            <button
                                onClick={() => handleApiTrigger(shortcutKey, shortcutValue, shortcutType)}
                                disabled={!shortcutKey}
                                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Play className="w-3 h-3 fill-current" />
                                Simulate Trigger Now
                            </button>
                          </div>
                      </div>

                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
                          <strong>How to use:</strong> In Apple Shortcuts, add the "Open URL" action and paste the link above. When the shortcut runs, it will open this app and apply the changes automatically.
                      </div>
                  </div>

                  <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
                      <button onClick={() => setIntegrationModalOpen(false)} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50">
                          Close
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Import Modal */}
      {importModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Import JSON</h3>
                  <p className="text-slate-500 text-sm mb-4">Paste JSON content here to replace your jar.</p>
                  <textarea 
                    className="w-full h-40 bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-xs mb-4 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='{"key": "value"}'
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setImportModalOpen(false)} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                      <button onClick={() => {
                          try {
                              const parsed = JSON.parse(jsonInput);
                              setData(parseImport(parsed));
                              setImportModalOpen(false);
                              setJsonInput('');
                          } catch(e) {
                              alert("Invalid JSON");
                          }
                      }} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium shadow-lg shadow-blue-600/20">Import</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}