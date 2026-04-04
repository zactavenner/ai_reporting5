import { useState, useCallback, useEffect, useRef } from 'react';
import { useNodesState, useEdgesState, addEdge, Connection } from '@xyflow/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { 
  FlowNode, 
  FlowEdge, 
  FlowNodeType,
} from '@/types/flowboard';
import {
  createImageGeneratorData as createImageData,
  createVideoGeneratorData as createVideoData,
  createPromptGeneratorData as createPromptData,
  createImageToVideoData as createI2VData,
  createAvatarSceneData,
  createSceneCombinerData,
  createImageCombinerData,
  createHooksData,
} from '@/types/flowboard';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

interface UseFlowboardOptions {
  projectId: string;
}

type HistoryEntry = { nodes: FlowNode[]; edges: FlowEdge[] };

export function useFlowboard({ projectId }: UseFlowboardOptions) {
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowboardId, setFlowboardId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // Undo/redo history
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback((n: FlowNode[], e: FlowEdge[]) => {
    if (isUndoRedoRef.current) return;
    const newEntry: HistoryEntry = { 
      nodes: JSON.parse(JSON.stringify(n)), 
      edges: JSON.parse(JSON.stringify(e)) 
    };
    // Trim future entries
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(newEntry);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setSaveStatus('unsaved');
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setSaveStatus('unsaved');
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
  }, [setNodes, setEdges]);

  // Debounced auto-save
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSaveStatus('unsaved');
    autoSaveTimerRef.current = setTimeout(() => {
      doSave();
    }, 2000);
  }, []); // doSave is stable via ref

  // Track changes for auto-save (debounced)
  const prevNodesLenRef = useRef(0);
  const prevEdgesLenRef = useRef(0);
  useEffect(() => {
    if (nodes.length !== prevNodesLenRef.current || edges.length !== prevEdgesLenRef.current) {
      prevNodesLenRef.current = nodes.length;
      prevEdgesLenRef.current = edges.length;
      if (flowboardId || nodes.length > 0) {
        pushHistory(nodes, edges);
        triggerAutoSave();
      }
    }
  }, [nodes.length, edges.length, flowboardId, pushHistory, triggerAutoSave]);

  // Fetch existing flowboard
  const { data: flowboard, isLoading } = useQuery({
    queryKey: ['flowboard', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('flowboards')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  // Load flowboard data
  useEffect(() => {
    if (flowboard) {
      setFlowboardId(flowboard.id);
      const loadedNodes = (flowboard.nodes as unknown as FlowNode[]) || [];
      const loadedEdges = (flowboard.edges as unknown as FlowEdge[]) || [];
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      // Initialize history
      historyRef.current = [{ nodes: JSON.parse(JSON.stringify(loadedNodes)), edges: JSON.parse(JSON.stringify(loadedEdges)) }];
      historyIndexRef.current = 0;
    }
  }, [flowboard, setNodes, setEdges]);

  // Core save logic
  const saveMutationRef = useRef(false);
  const doSave = useCallback(async () => {
    if (saveMutationRef.current) return;
    saveMutationRef.current = true;
    setSaveStatus('saving');

    try {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;

      // Validate: remove orphaned edges
      const nodeIds = new Set(currentNodes.map(n => n.id));
      const validEdges = currentEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

      const cleanNodes = currentNodes.map(node => {
        const { onDeleteNode, onRetryScene, ...cleanData } = node.data as any;
        return { ...node, data: { ...cleanData } };
      });

      const flowboardData = {
        project_id: projectId,
        name: 'Main Flowboard',
        nodes: cleanNodes as unknown as Json,
        edges: validEdges as unknown as Json,
        updated_at: new Date().toISOString(),
      };

      if (flowboardId) {
        const { error } = await supabase.from('flowboards').update(flowboardData).eq('id', flowboardId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('flowboards').insert({
          project_id: projectId,
          name: 'Main Flowboard',
          nodes: cleanNodes as unknown as Json,
          edges: validEdges as unknown as Json,
        }).select().single();
        if (error) throw error;
        setFlowboardId(data.id);
      }
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to save flowboard:', err);
      setSaveStatus('unsaved');
      toast.error('Failed to save flowboard');
    } finally {
      saveMutationRef.current = false;
    }
  }, [projectId, flowboardId]);

  // Manual save
  const saveFlowboard = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    doSave();
  }, [doSave]);

  // Handle connections
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
      setSaveStatus('unsaved');
      triggerAutoSave();
    },
    [setEdges, triggerAutoSave]
  );

  // Add node
  const addNode = useCallback((type: FlowNodeType) => {
    const id = `${type}-${Date.now()}`;
    const position = {
      x: 100 + (nodes.length % 3) * 320,
      y: 100 + Math.floor(nodes.length / 3) * 300,
    };

    const dataFactories: Record<FlowNodeType, () => any> = {
      'image-generator': createImageData,
      'video-generator': createVideoData,
      'prompt-generator': createPromptData,
      'image-to-video': createI2VData,
      'avatar-scene': createAvatarSceneData,
      'scene-combiner': createSceneCombinerData,
      'image-combiner': createImageCombinerData,
      'hooks': createHooksData,
    };

    const newNode: FlowNode = {
      id,
      type,
      position,
      data: dataFactories[type](),
    } as FlowNode;

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  }, [nodes.length, setNodes]);

  // Duplicate node
  const duplicateNode = useCallback((nodeId: string) => {
    const original = nodes.find(n => n.id === nodeId);
    if (!original) return;

    const newId = `${original.type}-${Date.now()}`;
    const { onDeleteNode, onRetryScene, generatedImageUrl, generatedVideoUrl, generatedVariations, outputVideoUrl, outputImageUrl, _savedToHistory, _imageSavedToHistory, _combinedSavedToHistory, ...cleanData } = original.data as any;
    
    const duplicated: FlowNode = {
      ...original,
      id: newId,
      position: { x: original.position.x + 40, y: original.position.y + 40 },
      data: { ...cleanData, status: 'idle', error: undefined },
      selected: false,
    } as FlowNode;

    setNodes((nds) => [...nds, duplicated]);
    setSelectedNodeId(newId);
    toast.success('Node duplicated');
  }, [nodes, setNodes]);

  // Update node data
  const updateNodeData = useCallback((nodeId: string, newData: Partial<FlowNode['data']>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } } as FlowNode
          : node
      )
    );
  }, [setNodes]);

  // Delete node (cascade: also removes connected edges)
  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    triggerAutoSave();
  }, [setNodes, setEdges, selectedNodeId, triggerAutoSave]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) as FlowNode | undefined;

  const clearFlow = useCallback(() => {
    pushHistory(nodes, edges);
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    triggerAutoSave();
  }, [setNodes, setEdges, nodes, edges, pushHistory, triggerAutoSave]);

  const setNodesAndEdges = useCallback((newNodes: FlowNode[], newEdges: FlowEdge[]) => {
    pushHistory(nodes, edges);
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId(null);
    triggerAutoSave();
  }, [setNodes, setEdges, nodes, edges, pushHistory, triggerAutoSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  return {
    nodes,
    edges,
    selectedNode: selectedNode || null,
    selectedNodeId,
    isLoading,
    isSaving: saveStatus === 'saving',
    saveStatus,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    duplicateNode,
    updateNodeData,
    setSelectedNodeId,
    saveFlowboard,
    clearFlow,
    deleteNode,
    setNodesAndEdges,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
