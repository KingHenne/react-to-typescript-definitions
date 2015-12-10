#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import * as babylon from 'babylon';
const minimist = require('minimist');

export function generateFromFile(name: string, path: string): string {
	return generate(name, fs.readFileSync(path).toString());
}

export function generate(name: string, code: string): string {
	const ast = babylon.parse(code, {
		sourceType: 'module',
		plugins: [
			'jsx',
			'flow',
			'asyncFunctions',
			'classConstructorCall',
			'doExpressions',
			'trailingFunctionCommas',
			'objectRestSpread',
			'decorators',
			'classProperties',
			'exportExtensions',
			'exponentiationOperator',
			'asyncGenerators',
			'functionSent'
		]
	});
	const writer = new Writer();
	writer.declareModule(name, () => {
		writer.import('* as React', 'react', () => {
			writer.nl();
			walk(ast.program, {
				'ExportDefaultDeclaration': (node: any) => {
					walk(node, {
						'ClassDeclaration': (node: any) => {
							let propTypes: any = false;
							walk(node.body, {
								'ClassProperty': (node: any) => {
									if (node.key.name == 'propTypes') {
										propTypes = {};
										walk(node.value, {
											'ObjectProperty': (node: any) => {
												propTypes[node.key.name] = getTypeFromPropType(node.value);
											}
										});
									}
								}
							});
							writer.props(propTypes);
							writer.nl();
							writer.exportDefault(() => {
								writer.class(node.id.name, !!propTypes);
							});
						}
					});
				}
			});
		});
	});
	return writer.toString();
}

function walk(node: any, handlers: any) {
	if (isNode(node)) {
		if (typeof handlers[node.type] == 'function') {
			handlers[node.type](node);
		}
		Object.keys(node).forEach((childKey: any) => {
			const child = node[childKey];
			let children = child;
			if (!Array.isArray(child)) {
				children = [child];
			}
			children.forEach((child: any) => {
				walk(child, handlers);
			});
		});
	}
}

function isNode(obj: any): boolean {
	return obj && typeof obj.type != 'undefined' && typeof obj.loc != 'undefined';
}

function getTypeFromPropType(node: any): string {
	if (isNode(node)) {
		const isMemberExpression = (node: any): boolean => {
			return node.type == 'MemberExpression';
		}
		const convertMemberExpression = (node: any): string => {
			if (isMemberExpression(node.object)) {
				return convertMemberExpression(node.object) + '.' + node.property.name;
			}
			return node.object.name + '.' + node.property.name;
		};
		if (isMemberExpression(node)) {
			const type = convertMemberExpression(node);
			switch (type) {
				case 'React.PropTypes.any':
					return 'any';
				case 'React.PropTypes.array':
					return 'any[]';
				case 'React.PropTypes.bool':
					return 'boolean';
				case 'React.PropTypes.func':
					return '(...args: any[]) => any';
				case 'React.PropTypes.number':
					return 'number';
				case 'React.PropTypes.object':
					return 'Object';
				case 'React.PropTypes.string':
					return 'string';
				case 'React.PropTypes.node':
					return 'React.ReactNode';
				case 'React.PropTypes.element':
					return 'React.ReactElement<any>';
			}
		}
	}
	return 'any';
}

class Writer {

	static NL = '\n';

	indentLevel = 0;

	code = '';

	indent(): void {
		let result = '';
		for (let i = 0, n = this.indentLevel; i < n; i++) {
			result += '\t';
		}
		this.code += result;
	}

	nl(): void {
		this.code += Writer.NL;
	}

	declareModule(name: string, fn: () => void) {
		this.indent();
		this.code += `declare module '${name}' {`;
		this.nl();
		this.indentLevel++;
		fn();
		this.indentLevel--;
		this.indent();
		this.code += '}';
		this.nl();
	}

	import(decl: string, from: string, fn: () => void) {
		this.indent();
		this.code += `import ${decl} from '${from}';`;
		this.nl();
		fn();
	}

	props(props: any, fn?: () => void) {
		this.interface('Props', () => {
			Object.keys(props).forEach((propName: any) => this.prop(propName, props[propName], true));
		});
		fn && fn();
	}

	prop(name: string, type: string, optional: boolean, fn?: () => void): void {
		this.indent();
		this.code += `${name}${optional ? '?' : ''}: ${type};`;
		this.nl();
		fn && fn();
	}

	interface(name: string, fn: () => void) {
		this.indent();
		this.code += `interface ${name} {`;
		this.nl();
		this.indentLevel++;
		fn();
		this.indentLevel--;
		this.indent();
		this.code += '}';
		this.nl();
	}

	exportDefault(fn: () => void) {
		this.indent();
		this.code += 'export default ';
		fn();
	}

	class(name: string, props: boolean, fn?: () => void) {
		this.code += `class ${name} extends React.Component<${props ? 'Props' : 'any'}, any> {`;
		this.nl();
		this.indentLevel++;
		fn && fn();
		this.indentLevel--;
		this.indent();
		this.code += '}';
		this.nl();
	}

	toString(): string {
		return this.code;
	}

}

const options = minimist(process.argv.slice(2), {
	string: 'name'
});

const stdinCode: string[] = [];
process.stdin.on('readable', () => {
	const chunk = process.stdin.read();
	if (chunk !== null) {
		stdinCode.push(chunk.toString());
	} else {
		// No stdin -> let node terminate
		process.stdin.pause();
	}
});
process.stdin.on('end', () => {
	if (!options.name) {
		console.error('Failed to specify --name parameter');
		process.exit(1);
	}
	process.stdout.write(generate(options.name, stdinCode.join('')));
});
