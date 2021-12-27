import * as fs from "fs";
import { sendUnaryData, ServerReadableStream, ServerWritableStream, status } from "grpc";
import * as stream from "stream";
import { IFileStreamingServiceServer } from "../proto/streamer_grpc_pb";
import { Chunk, FileDescriptor } from "../proto/streamer_pb";

export class DefaultFileStreamingService implements IFileStreamingServiceServer {

    read(call: ServerWritableStream<FileDescriptor, Chunk>) {

        const path = call.request.getPath();
        const stream = fs.createReadStream(path);

        stream.on("error", err => {
            console.error(`cannot open read stream to [${path}]: ${err}`);
            call.emit("status", status.NOT_FOUND);
            call.end();
        });

        stream.on("data", (data: Buffer) => {
            stream.pause();
            const ck = new Chunk();
            ck.setChunk(data);

            call.write(ck, err => {
                if (err) {
                    console.error(`error writing chunk to peer ${call.getPeer()}: ${err}`);
                    stream.destroy(err);
                    call.emit("status", status.ABORTED);
                    call.end();
                    return;
                }

                stream.resume();
            });
        });

        stream.on("end", () => {
            call.end();
        });

        call.on("cancelled", () => {
            console.debug(`streaming call cancelled by client: ${call.getPeer()}`);
            stream.destroy();
        });
        call.on("error", err => {
            console.error(`streaming call with peer ${call.getPeer()} ran into an error: ${err}`);
            stream.destroy(err);
        });
    }

    write(call: ServerReadableStream<Chunk>, callback: sendUnaryData<FileDescriptor>) {
        const md = call.metadata;
        const pathMd = md.get("path");
        if (pathMd.length !== 1 || pathMd[0] === "") {
            return callback({ ...new Error("path is required"), code: status.INVALID_ARGUMENT }, null);
        }

        const path = pathMd[0].toString();
        console.debug(`preparing to write file at ${path}`);


        const transform = new stream.PassThrough();
        this.writeToFile(path, transform);

        call.on("data", (data: Chunk) => {
            call.pause();
            transform.write(data.getChunk_asU8(), err => {
                if (err) {
                    console.error("cannot write data to writable stream", err);
                    return;
                }
                call.resume();
            });
        });

        call.on("end", () => {
            transform.destroy();

            const fd = new FileDescriptor();
            fd.setPath(path);
            callback(null, fd);
        });
    }

    private writeToFile(path: string, data: stream.Readable) {
        const writeStream = fs.createWriteStream(path);
        data.pipe(writeStream);
    }
}