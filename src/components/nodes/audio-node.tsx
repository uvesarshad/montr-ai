'use client';

import React, { useCallback, memo, useState, useRef, ChangeEvent } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell, { NodePreviewCard } from './node-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Upload, StopCircle, Loader2, X, FileAudio } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { transcribeAudio } from '@/ai/flows';
import NodeHandle from './node-handle';

interface AudioFileData {
  name: string;
  dataUrl: string;
  mimeType: string;
}

const AudioNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState(data.transcript || '');
  const [audioFile, setAudioFile] = useState<AudioFileData | null>(data.audioFile || null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const isLoading = isRecording || isTranscribing;

  const handleTranscription = useCallback(async (audioDataUrl: string, mimeType: string) => {
    setIsTranscribing(true);
    toast({ title: 'AI is transcribing...' });
    try {
      const base64Data = audioDataUrl.split(',')[1];

      if (!base64Data) {
        throw new Error("Invalid data URI for transcription.");
      }

      const result = await transcribeAudio({
        audioBase64: base64Data,
        mimeType,
      });

      setTranscript(result.transcript);
      updateNodeData({ transcript: result.transcript });
      propagateToOutgoers(result.transcript);
      toast({ title: 'Transcription Successful', description: 'Your audio has been transcribed.' });
    } catch (error) {
      console.error("Transcription failed", error);
      toast({ variant: 'destructive', title: 'Transcription Failed', description: error instanceof Error ? error.message : 'Could not process the audio.' });
    } finally {
      setIsTranscribing(false);
    }
  }, [toast, updateNodeData, propagateToOutgoers]);


  const processAndSetAudio = (blob: Blob, name: string) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const newAudioFile: AudioFileData = { name, dataUrl, mimeType: blob.type };
      setAudioFile(newAudioFile);
      updateNodeData({ audioFile: newAudioFile, transcript: '' }); // Clear old transcript
      setTranscript('');
      handleTranscription(dataUrl, blob.type);
    };
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const options = { mimeType: 'audio/webm; codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        toast({ variant: 'destructive', title: 'Recording Error', description: 'WEBM Opus audio format is not supported on this browser.' });
        return;
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
        processAndSetAudio(audioBlob, `recording-${new Date().toISOString()}.webm`);
        audioChunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      });

      mediaRecorder.start();
      setIsRecording(true);
      toast({ title: 'Recording Started', description: 'Speak into your microphone.' });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast({ variant: 'destructive', title: 'Microphone Error', description: 'Could not access the microphone. Please check permissions.' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast({ title: 'Recording Stopped' });
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processAndSetAudio(file, file.name);
    }
  };

  const removeAudio = () => {
    setAudioFile(null);
    setTranscript('');
    updateNodeData({ audioFile: null, transcript: '' });
  };

  return (
    <NodeShell
      id={id}
      nodeType="audioNode"
      selected={selected}
      onDelete={deleteNode}
      minWidth={320}
      contentClassName="p-2 relative"
      title="Audio"
      icon={<Mic className="h-full w-full" />}
    >
      {isTranscribing && <Loader2 className="size-4 animate-spin text-primary absolute top-4 right-4" />}

      <div className="nodrag">
        {!audioFile ? (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1 cursor-pointer rounded-full h-8 justify-start px-3" disabled={isLoading}>
              <label htmlFor={`audio-upload-${id}`} className="flex items-center gap-2 w-full cursor-pointer">
                <Upload className="size-3.5" />
                <span className="text-xs font-normal text-muted-foreground">Upload Audio</span>
                <Input id={`audio-upload-${id}`} type="file" className="sr-only" onChange={handleFileUpload} accept="audio/*" />
              </label>
            </Button>
            {!isRecording ? (
              <Button size="sm" className="h-8 rounded-full px-4" onClick={startRecording} disabled={isLoading}>
                <Mic className="size-3.5 mr-2" /> Record
              </Button>
            ) : (
              <Button size="sm" className="h-8 rounded-full px-4" onClick={stopRecording} variant="destructive">
                <StopCircle className="size-3.5 mr-2" /> Stop
              </Button>
            )}
          </div>
        ) : (
          <NodePreviewCard className="mt-0">
            <div className="group relative p-2 px-3 flex items-center gap-2 bg-muted/30">
              <FileAudio className="size-5 text-muted-foreground" />
              <span className="text-sm truncate flex-1 font-medium">{audioFile.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive transition-colors ml-1"
                onClick={removeAudio}
              >
                <X className="size-3" />
              </Button>
            </div>
            <div className="p-3 pt-0">
              <audio controls src={audioFile.dataUrl} className="w-full h-8" />
            </div>
          </NodePreviewCard>
        )}
      </div>

      {isTranscribing && !transcript && (
        <div className="flex items-center text-xs text-muted-foreground mt-2">
          <Loader2 className="size-3 mr-2 animate-spin" />
          <span>AI is transcribing...</span>
        </div>
      )}

      {transcript && (
        <div className="mt-4 nodrag">
          <label className="text-xs font-semibold text-muted-foreground">
            Transcript
          </label>
          <Textarea
            className="mt-1 bg-muted"
            value={transcript}
            readOnly
            rows={6}
          />
        </div>
      )}

      <NodeHandle type="source" position={Position.Right} nodeType="audioNode" isConnectable={isConnectable} id="transcript-output" />
      <NodeHandle type="target" position={Position.Left} nodeType="audioNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(AudioNode);
