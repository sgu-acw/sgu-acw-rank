"""Prepare an experimental B-JVM bootstrap probe, outside the installable manifest."""
import argparse
import json as _json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path


def flatten(jars, output, modular=False):
    seen = set()
    services: dict[str, list[str]] = {}
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as out:
        for jar in jars:
            with zipfile.ZipFile(jar) as source:
                for entry in source.infolist():
                    if entry.is_dir():
                        continue
                    name = entry.filename
                    if modular:
                        if not name.startswith("classes/"):
                            continue
                        name = name[len("classes/"):]
                        if name == "module-info.class":
                            name = f"META-INF/module-descriptors/{jar.stem}/module-info.class"
                    # ServiceLoader 配置是追加语义：所有模块的 providers 都要进同一个文件。
                    if name.startswith("META-INF/services/"):
                        services.setdefault(name, []).extend(
                            l for l in source.read(entry).decode().splitlines()
                            if l.strip() and not l.startswith("#")
                        )
                        continue
                    if name in seen:
                        # Retain colliding resources for inspection; this probe is not a release archive.
                        name = f"META-INF/probe-collisions/{jar.parent.name}-{jar.stem}/{name}"
                    seen.add(name)
                    out.writestr(name, source.read(entry))
        # jmod 的服务绑定在 module-info 的 provides 里，不是 META-INF/services。
        # 运行期 ServiceLoader 走类路径扫描，手工补上需要的 provider。
        service_bindings = {
            "META-INF/services/java.nio.file.spi.FileSystemProvider": [
                "jdk.internal.jrtfs.JrtFileSystemProvider",
                "jdk.nio.zipfs.ZipFileSystemProvider",
            ],
            "META-INF/services/sun.util.locale.provider.LocaleDataMetaInfo": [
                "sun.util.resources.cldr.provider.CLDRLocaleDataMetaInfo",
                "sun.util.resources.provider.NonBaseLocaleDataMetaInfo",
            ],
            "META-INF/services/sun.util.resources.LocaleData$CommonResourceBundleProvider": [
                "sun.util.resources.provider.LocaleDataProvider",
            ],
            "META-INF/services/sun.util.resources.LocaleData$SupplementaryResourceBundleProvider": [
                "sun.util.resources.provider.SupplementaryLocaleDataProvider",
            ],
        }
        for name, providers in service_bindings.items():
            services.setdefault(name, []).extend(providers)
        for name, providers in services.items():
            out.writestr(name, "\n".join(dict.fromkeys(providers)) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java8-jars", type=Path,
                        default=Path(os.environ['LEARN_JAVA8_JARS']) if os.environ.get('LEARN_JAVA8_JARS') else None)
    parser.add_argument("--java21-home", type=Path,
                        default=Path(os.environ['LEARN_JAVA_HOME']) if os.environ.get('LEARN_JAVA_HOME') else None)
    parser.add_argument("--ecj", type=Path, default=Path.home()/".cache/sgu-acw-judge/ecj.jar")
    parser.add_argument("--java21-jar", type=Path)
    parser.add_argument("--build", type=Path, default=Path.home()/".cache/sgu-acw-judge/bjvm-wasm")
    args = parser.parse_args()
    if not args.java8_jars or not args.java21_home:
        raise SystemExit(
            "需要真实 JDK 输入：LEARN_JAVA8_JARS=<JDK8 jars 目录> "
            "LEARN_JAVA_HOME=<JDK21 安装目录> pnpm learning:java")
    project = Path(__file__).resolve().parents[2]
    output = project/".local/learning/packages/java-probe"
    output.mkdir(parents=True, exist_ok=True)
    for name in ["bjvm_main.js", "bjvm_main.wasm"]:
        shutil.copy2(args.build/name, output/name)
    shutil.copy2(Path(__file__).with_name("java-probe-worker.js"), output/"worker.js")
    # 重打包 ECJ，去掉签名块——签名验证会把 jar 读取拖进 PKCS7/ICU 依赖链，
    # 而本地练习不需要验证发行方。去签后 JarFile 走普通 zip 路径。
    with zipfile.ZipFile(args.ecj) as src, zipfile.ZipFile(output/"ecj.jar", "w", zipfile.ZIP_DEFLATED) as dst:
        manifest = src.read("META-INF/MANIFEST.MF")
        manifest = b"\n".join(
            line for line in manifest.split(b"\n") if not line.lower().startswith((b"sha", b"x-", b" "))
        )
        dst.writestr("META-INF/MANIFEST.MF", manifest)
        for entry in src.infolist():
            name = entry.filename.upper()
            if name == "META-INF/MANIFEST.MF" or name.startswith("META-INF/") and name.endswith((".SF", ".RSA", ".DSA", ".EC")):
                continue
            dst.writestr(entry, src.read(entry.filename))
    # B-JVM 里 jar 资源能读了，但 ResourceBundle 只认目录类路径。
    # 把 ECJ 的 properties 等资源解出来放到 / 下绕过。
    res_out = output/"ecj-res"
    res_out.mkdir(exist_ok=True)
    res_index = []
    for entry in zipfile.ZipFile(args.ecj).infolist():
        name = entry.filename
        if entry.is_dir() or name.endswith(".class") or name.startswith("META-INF/"):
            continue
        dest = res_out/name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(zipfile.ZipFile(args.ecj).read(name))
        res_index.append(name)
    # ResourceBundle 在 B-JVM 里找不到 .properties 包；改成类形式的 bundle。
    # 类加载走已验证可用的路径。对 ECJ 里每个 properties bundle 生成同名类。
    def unescape(s):
        out, i = [], 0
        while i < len(s):
            if s[i] == '\\' and i + 1 < len(s):
                nxt = s[i + 1]
                if nxt == 'u' and i + 5 < len(s):
                    out.append(chr(int(s[i + 2:i + 6], 16))); i += 6; continue
                out.append({'n': '\n', 't': '\t', 'r': '\r', 'f': '\f'}.get(nxt, nxt))
                i += 2
            else:
                out.append(s[i]); i += 1
        return ''.join(out)

    def jstr(s):
        # 不用 \\uXXXX：javac 会把源码里的 \\uXXXX 预处理成真字符，引号/换行会坏字面量。
        out = []
        for ch in s:
            if ch == '"':
                out.append('\\"')
            elif ch == '\\':
                out.append('\\\\')
            elif ch == '\n':
                out.append('\\n')
            elif ch == '\r':
                out.append('\\r')
            elif ch == '\t':
                out.append('\\t')
            else:
                out.append(ch)
        return '"' + "".join(out) + '"'

    bundle_src_dir = output/"bundle-src"
    with zipfile.ZipFile(args.ecj) as src:
        prop_names = [n for n in src.namelist()
                      if n.endswith(".properties") and not n.startswith("META-INF/")]
        for prop_name in prop_names:
            class_name = prop_name[:-len(".properties")]
            pkg, _, base = class_name.rpartition("/")
            if not base.isidentifier():
                continue
            props = {}
            for line in src.read(prop_name).decode("iso-8859-1").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                props[unescape(k.strip())] = unescape(v.strip())
            if not props:
                continue
            entries = ",\n".join(f"        {{{jstr(k)}, {jstr(v)}}}" for k, v in props.items())
            source_text = (
                f"package {pkg.replace('/', '.')};\n"
                f"public final class {base} extends java.util.ListResourceBundle {{\n"
                "    private static final Object[][] CONTENTS = {\n" + entries + "\n    };\n"
                "    protected Object[][] getContents() { return CONTENTS; }\n}\n"
            )
            out_dir = bundle_src_dir/pkg
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir/f"{base}.java").write_text(source_text)
    sources = sorted(str(x) for x in bundle_src_dir.rglob("*.java"))
    if sources:
        subprocess.run([
            str(args.java21_home/"bin/javac"), "-source", "8", "-target", "8", "-Xlint:-options",
            "-nowarn", "-encoding", "UTF-8", "-d", str(output/"bundle-classes"), *sources,
        ], check=True)
    (output/"bundle-classes-index.json").write_text(
        _json.dumps(sorted(str(x.relative_to(output/"bundle-classes"))
                           for x in (output/"bundle-classes").rglob("*.class"))))
    (output/"out").mkdir(exist_ok=True)
    subprocess.run([
        str(args.java21_home/"bin/javac"), "-source", "8", "-target", "8", "-Xlint:-options",
        "-classpath", str(args.ecj),
        "-d", str(output), str(Path(__file__).with_name("fixtures")/"JudgeProbe.java"),
    ], check=True)
    # SimpleConsoleLogger 的 CallerFinder 依赖 StackWalker native，B-JVM 没有。
    # 用打过补丁的 class 覆盖：日志退回 logger 名而不是推断调用点。
    patch_src = Path(__file__).with_name("fixtures")/"jdk-patch"
    for f in patch_src.rglob("*.java"):
        rel = f.relative_to(patch_src)
        subprocess.run([
            str(args.java21_home/"bin/javac"), "--patch-module", f"java.base={patch_src}",
            "-d", str(output/"patch-classes"), str(f),
        ], check=True)
    (output/"patch-classes-index.json").write_text(_json.dumps(
        sorted(str(x.relative_to(output/"patch-classes"))
               for x in (output/"patch-classes").rglob("*.class")) if (output/"patch-classes").exists() else []))
    flatten(sorted(args.java8_jars.rglob("*.jar")), output/"java8.jar")
    if args.java21_jar:
        shutil.copy2(args.java21_jar, output/"java21.jar")
    else:
        flatten(sorted((args.java21_home/"jmods").glob("*.jmod")), output/"java21.jar", True)
    # 打过补丁的类直接写回 jar：B-JVM 的 boot classpath 里 jar 永远排在 / 前面，
    # 目录类路径覆盖不了 jar 同名类，只能改写 jar 内条目。
    if (output/"patch-classes").exists():
        patched = {str(x.relative_to(output/"patch-classes")): x.read_bytes()
                   for x in (output/"patch-classes").rglob("*.class")}
        tmp = output/"java21.jar.tmp"
        with zipfile.ZipFile(output/"java21.jar") as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as dst:
            replaced = set()
            for entry in src.infolist():
                if entry.filename in patched:
                    dst.writestr(entry.filename, patched.pop(entry.filename))
                    replaced.add(entry.filename)
                else:
                    dst.writestr(entry, src.read(entry))
            for name, data in patched.items():
                dst.writestr(name, data)
        tmp.replace(output/"java21.jar")
        print(f"patched {len(replaced)} classes in java21.jar")
    shutil.copy2(args.java21_home/"lib/modules", output/"modules21")
    shutil.copy2(args.java21_home/"lib/tzdb.dat", output/"tzdb.dat")
    # JDK 的 conf/（java.security 等）在 VM 里按 java.home=/jdk23 读取。
    shutil.copy2(args.java21_home/"release", output/"jdk-release")
    conf_out = output/"jdk-conf"
    conf_out.mkdir(exist_ok=True)
    for f in (args.java21_home/"conf").rglob("*"):
        if f.is_file():
            rel = f.relative_to(args.java21_home/"conf")
            dest = conf_out/rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)
    for version, major in [("java8", 52), ("java21", 65)]:
        with zipfile.ZipFile(output/f"{version}.jar") as archive:
            assert int.from_bytes(archive.read("java/lang/Object.class")[6:8], "big") == major
            assert "com/sun/tools/javac/Main.class" in archive.namelist()
    print("Experimental probe resources ready; Java packages remain unavailable to students.")
    (output/"jdk-conf-index.json").write_text(_json.dumps(
        sorted(str(f.relative_to(conf_out)) for f in conf_out.rglob('*') if f.is_file())))
    (output/"ecj-res-index.json").write_text(_json.dumps(sorted(res_index)))


if __name__ == "__main__":
    main()
